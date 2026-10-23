"""Vercel 서버리스 진입점. /api/* 요청을 app.py의 Handler가 처리해요."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import Handler as _Handler  # noqa: E402


class handler(_Handler):
    pass
