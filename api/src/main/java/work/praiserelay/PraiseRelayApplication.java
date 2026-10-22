package work.praiserelay;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.io.File;

@SpringBootApplication
public class PraiseRelayApplication {

    public static void main(String[] args) {
        // SQLite는 폴더를 만들어 주지 않으므로 DB 연결 전에 data 폴더를 준비해요.
        new File("data").mkdirs();
        SpringApplication.run(PraiseRelayApplication.class, args);
    }
}
