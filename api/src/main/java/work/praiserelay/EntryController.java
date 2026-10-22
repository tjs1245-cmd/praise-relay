package work.praiserelay;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/entries")
public class EntryController {

    private static final int MAX_BODY_BYTES = 8 * 1024;

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper = new ObjectMapper();

    public EntryController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public Map<String, Object> list() {
        List<Map<String, Object>> entries = jdbc.query(
                "SELECT id, name, message, recipient, created_at FROM entries ORDER BY id DESC LIMIT 200",
                (rs, i) -> toEntry(rs.getLong("id"), rs.getString("name"), rs.getString("message"),
                        rs.getString("recipient"), rs.getString("created_at")));
        return Map.of("entries", entries);
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(HttpServletRequest request) throws IOException {
        long declared = request.getContentLengthLong();
        if (declared > MAX_BODY_BYTES) {
            throw new ApiException(413, "본문이 너무 커요. 8KiB 이하로 보내 주세요.");
        }
        String contentType = request.getContentType();
        if (contentType == null || !isJson(contentType)) {
            throw new ApiException(415, "JSON 형식(application/json)으로 보내 주세요.");
        }
        byte[] body = readLimited(request.getInputStream());

        JsonNode root;
        try {
            root = mapper.readTree(body);
        } catch (IOException e) {
            throw new ApiException(400, "JSON을 읽을 수 없어요.");
        }
        if (root == null || !root.isObject()) {
            throw new ApiException(400, "JSON 객체로 보내 주세요.");
        }

        String name = requiredText(root, "name", 40, "작성자");
        String message = requiredText(root, "message", 500, "칭찬 한마디");
        String to = optionalText(root, "to", 40, "받는 사람");
        String createdAt = Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();

        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO entries (name, message, recipient, created_at) VALUES (?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, name);
            ps.setString(2, message);
            ps.setString(3, to);
            ps.setString(4, createdAt);
            return ps;
        }, keys);
        long id = ((Number) keys.getKeys().values().iterator().next()).longValue();

        return ResponseEntity.status(201).body(Map.of("entry", toEntry(id, name, message, to, createdAt)));
    }

    private static boolean isJson(String contentType) {
        try {
            MediaType type = MediaType.parseMediaType(contentType);
            return type.getType().equalsIgnoreCase("application")
                    && (type.getSubtype().equalsIgnoreCase("json") || type.getSubtype().toLowerCase().endsWith("+json"));
        } catch (Exception e) {
            return false;
        }
    }

    private static byte[] readLimited(InputStream in) throws IOException {
        byte[] data = in.readNBytes(MAX_BODY_BYTES + 1);
        if (data.length > MAX_BODY_BYTES) {
            throw new ApiException(413, "본문이 너무 커요. 8KiB 이하로 보내 주세요.");
        }
        return data;
    }

    private static String requiredText(JsonNode root, String field, int max, String label) {
        JsonNode node = root.get(field);
        if (node == null || !node.isTextual()) {
            throw new ApiException(400, label + "은(는) 글자로 적어 주세요.");
        }
        String value = node.asText().strip();
        if (value.isEmpty() || value.length() > max) {
            throw new ApiException(400, label + "은(는) 1~" + max + "자로 적어 주세요.");
        }
        return value;
    }

    private static String optionalText(JsonNode root, String field, int max, String label) {
        JsonNode node = root.get(field);
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isTextual()) {
            throw new ApiException(400, label + "은(는) 글자로 적어 주세요.");
        }
        String value = node.asText().strip();
        if (value.isEmpty()) {
            return null;
        }
        if (value.length() > max) {
            throw new ApiException(400, label + "은(는) " + max + "자 이하로 적어 주세요.");
        }
        return value;
    }

    private static Map<String, Object> toEntry(long id, String name, String message, String to, String createdAt) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", id);
        entry.put("name", name);
        entry.put("message", message);
        if (to != null) {
            entry.put("to", to);
        }
        entry.put("created_at", createdAt);
        return entry;
    }
}
