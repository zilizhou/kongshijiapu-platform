#!/usr/bin/env python3
"""Parse 待攷支一/二 TXT into tb_daikao_* tables."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

CN_DIGITS = {
    "零": 0,
    "〇": 0,
    "一": 1,
    "二": 2,
    "两": 2,
    "兩": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}


def cn_to_int(s: str) -> int | None:
    s = s.strip()
    if not s:
        return None
    if s.isdigit():
        return int(s)
    if s == "十":
        return 10
    if s.startswith("十"):
        rest = s[1:]
        return 10 + (CN_DIGITS.get(rest, 0) if rest else 0)
    if "十" in s:
        left, _, right = s.partition("十")
        return CN_DIGITS.get(left, 0) * 10 + (CN_DIGITS.get(right, 0) if right else 0)
    if s in CN_DIGITS:
        return CN_DIGITS[s]
    return None


def parse_generation(label: str) -> int | None:
    m = re.match(r"^([一二三四五六七八九十百零〇两兩\d]+)代$", label.strip())
    if not m:
        return None
    return cn_to_int(m.group(1))


PERSON_RE = re.compile(
    r"^(?P<indent>\s*)(?P<at>@?)(?P<mark>\*#\*|\*+)"
    # 姓名（不含数字）；谱号；女性标记 ^（源文件惯例）
    r"(?P<name>[^\d＃#<\s]+?)(?:＃|#)?(?P<no>\d{1,10})?(?:[&]*)?(?P<female>\^)?\s*"
    r"(?P<a><[^>]*>)\s*"
    r"(?P<b><[^>]*>)\s*"
    r"(?:(?P<c><[^>]*>)\s*)?"
    r"(?P<gen>[一二三四五六七八九十百零〇两兩\d]+代)\s+"
    r"(?P<g1>\S+)\s+(?P<g2>\S+)\s+(?P<g3>\S+)\s*"
    r"(?P<desc>.*)$"
)


def infer_sex_and_spouse(desc: str, female_mark: bool = False) -> tuple[str, str | None]:
    spouse = None
    sex = "女" if female_mark else "男"
    if not desc:
        return sex, spouse
    m = re.search(r"妻([^子住址上\d]{1,20}?)(?:子|女|住址|兼|出|$)", desc)
    if m:
        spouse = m.group(1).strip("　 ,，")
    m2 = re.search(r"夫([^子住址上\d]{1,20}?)(?:子|女|住址|兼|出|$)", desc)
    if m2:
        sex = "女"
        spouse = m2.group(1).strip("　 ,，")
    return sex, spouse or None


def extract_address(desc: str) -> str | None:
    m = re.search(r"住址[:：]?\s*([^\s].*?)\s*$", desc)
    if m:
        return m.group(1).strip()
    return None


def sql_quote(v: str | None) -> str:
    if v is None:
        return "NULL"
    return "'" + str(v).replace("\\", "\\\\").replace("'", "''") + "'"


@dataclass
class Person:
    source_file: str
    source_line: int
    volume: str | None
    section_path: str | None
    is_root: int
    is_out_heir: int
    indent_spaces: int
    name: str
    spectrum_no: str | None
    generation: int | None
    generation_label: str
    group_raw: str
    group1: str
    group2: str
    group3: str
    children_sample: str
    children_with_no: str
    out_heirs: str | None
    description: str
    sex: str
    spouse: str | None
    address: str | None
    parent_name: str | None = None
    parent_no: str | None = None
    tree_path: str = ""
    raw_line: str = ""


@dataclass
class ParseError:
    source_file: str
    source_line: int
    reason: str
    raw_line: str


@dataclass
class ParseResult:
    people: list[Person] = field(default_factory=list)
    errors: list[ParseError] = field(default_factory=list)


def parse_file(path: Path, source_file: str) -> ParseResult:
    raw = path.read_bytes()
    text = raw.decode("gb18030").replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    result = ParseResult()

    volume: str | None = None
    sections: list[str] = []
    # stack: (indent, seq, name, no, tree_path)
    stack: list[tuple[int, int, str, str | None, str]] = []
    seq = 0

    for i, line in enumerate(lines, 1):
        if not line.strip():
            continue
        if line.startswith("&"):
            body = line[1:].strip()
            if not body:
                continue
            if body.startswith("孔子世家譜") or body.startswith("孔子世家谱"):
                volume = body
                sections = []  # 新卷或卷终都清空小节栈
                continue
            if body.startswith("待攷") or "整理" in body:
                continue
            if re.match(r"^[一二三四五六七八九十百千0-9]+[、.．]", body) or "歸" in body:
                continue
            # section header
            sections.append(body)
            # keep path reasonable: drop trailing duplicates lightly by capping
            if len(sections) > 8:
                sections = sections[-8:]
            continue

        if "*" not in line[:40] and not line.lstrip().startswith("@*"):
            if line.strip():
                result.errors.append(
                    ParseError(source_file, i, "non_person_line", line[:2000])
                )
            continue

        m = PERSON_RE.match(line)
        if not m:
            result.errors.append(
                ParseError(source_file, i, "person_unparsed", line[:2000])
            )
            continue

        d = m.groupdict()
        indent = len(d["indent"])
        name = d["name"]
        no = d["no"] or None
        gen_label = d["gen"]
        g1, g2, g3 = d["g1"], d["g2"], d["g3"]
        desc = (d["desc"] or "").strip()
        sex, spouse = infer_sex_and_spouse(desc, female_mark=bool(d.get("female")))
        address = extract_address(desc)

        while stack and stack[-1][0] >= indent:
            stack.pop()
        parent_name = stack[-1][2] if stack else None
        parent_no = stack[-1][3] if stack else None

        seq += 1
        if stack:
            tree_path = f"{stack[-1][4]}.{seq}"
        else:
            tree_path = str(seq)

        # section_path: prefer last few meaningful headers
        sec = "/".join(sections[-3:]) if sections else None

        person = Person(
            source_file=source_file,
            source_line=i,
            volume=volume,
            section_path=sec,
            is_root=1 if d["mark"].startswith("*#*") else 0,
            is_out_heir=1 if d["at"] else 0,
            indent_spaces=indent,
            name=name,
            spectrum_no=no,
            generation=parse_generation(gen_label),
            generation_label=gen_label,
            group_raw=f"{g1},{g2},{g3}",
            group1=g1,
            group2=g2,
            group3=g3,
            children_sample=d["a"],
            children_with_no=d["b"],
            out_heirs=d["c"],
            description=desc,
            sex=sex,
            spouse=spouse,
            address=address,
            parent_name=parent_name,
            parent_no=parent_no,
            tree_path=tree_path,
            raw_line=line[:2000],
        )
        result.people.append(person)
        stack.append((indent, seq, name, no, tree_path))

    return result


def emit_sql(people: list[Person], errors: list[ParseError], out: Path) -> None:
    # Assign stable ids and resolve parent_id in Python (same source_file tree_path)
    path_to_id: dict[tuple[str, str], int] = {}
    parent_ids: list[int | None] = []
    for idx, p in enumerate(people, start=1):
        path_to_id[(p.source_file, p.tree_path)] = idx
    for p in people:
        if "." not in p.tree_path:
            parent_ids.append(None)
            continue
        parent_path = p.tree_path.rsplit(".", 1)[0]
        parent_ids.append(path_to_id.get((p.source_file, parent_path)))

    chunks: list[str] = []
    chunks.append("SET NAMES utf8mb4;")
    chunks.append("SET FOREIGN_KEY_CHECKS=0;")
    chunks.append("TRUNCATE TABLE tb_daikao_parse_error;")
    chunks.append("TRUNCATE TABLE tb_daikao_people;")
    chunks.append("ALTER TABLE tb_daikao_people AUTO_INCREMENT = 1;")

    batch: list[str] = []

    def flush_people() -> None:
        nonlocal batch
        if not batch:
            return
        cols = (
            "id,source_file,source_line,volume,section_path,is_root,is_out_heir,"
            "indent_spaces,name,spectrum_no,generation,generation_label,"
            "group_raw,group1,group2,group3,children_sample,children_with_no,"
            "out_heirs,description,sex,spouse,address,parent_id,parent_name,parent_no,"
            "tree_path,raw_line"
        )
        chunks.append(
            f"INSERT INTO tb_daikao_people ({cols}) VALUES\n"
            + ",\n".join(batch)
            + ";"
        )
        batch = []

    for idx, p in enumerate(people):
        pid = parent_ids[idx]
        batch.append(
            "("
            + ",".join(
                [
                    str(idx + 1),
                    sql_quote(p.source_file),
                    str(p.source_line),
                    sql_quote(p.volume),
                    sql_quote(p.section_path),
                    str(p.is_root),
                    str(p.is_out_heir),
                    str(p.indent_spaces),
                    sql_quote(p.name),
                    sql_quote(p.spectrum_no),
                    "NULL" if p.generation is None else str(p.generation),
                    sql_quote(p.generation_label),
                    sql_quote(p.group_raw),
                    sql_quote(p.group1),
                    sql_quote(p.group2),
                    sql_quote(p.group3),
                    sql_quote(p.children_sample),
                    sql_quote(p.children_with_no),
                    sql_quote(p.out_heirs),
                    sql_quote(p.description),
                    sql_quote(p.sex),
                    sql_quote(p.spouse),
                    sql_quote(p.address),
                    "NULL" if pid is None else str(pid),
                    sql_quote(p.parent_name),
                    sql_quote(p.parent_no),
                    sql_quote(p.tree_path),
                    sql_quote(p.raw_line),
                ]
            )
            + ")"
        )
        if len(batch) >= 300:
            flush_people()
    flush_people()

    err_batch: list[str] = []

    def flush_err() -> None:
        nonlocal err_batch
        if not err_batch:
            return
        chunks.append(
            "INSERT INTO tb_daikao_parse_error (source_file,source_line,reason,raw_line) VALUES\n"
            + ",\n".join(err_batch)
            + ";"
        )
        err_batch = []

    for e in errors:
        err_batch.append(
            "("
            + ",".join(
                [
                    sql_quote(e.source_file),
                    str(e.source_line),
                    sql_quote(e.reason),
                    sql_quote(e.raw_line),
                ]
            )
            + ")"
        )
        if len(err_batch) >= 200:
            flush_err()
    flush_err()

    chunks.append("SET FOREIGN_KEY_CHECKS=1;")
    out.write_text("\n".join(chunks), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    ap.add_argument("--sql-out", type=Path, default=None)
    ap.add_argument("--apply", action="store_true", help="scp+mysql apply on remote")
    ap.add_argument("--host", default="user@192.168.1.112")
    args = ap.parse_args()

    repo: Path = args.repo
    files = [
        (repo / "待攷支一.TXT", "待攷支一"),
        (repo / "待攷支二.txt", "待攷支二"),
    ]
    # fallback uppercase
    if not files[1][0].exists():
        files[1] = (repo / "待攷支二.TXT", "待攷支二")

    all_people: list[Person] = []
    all_errors: list[ParseError] = []
    for path, label in files:
        if not path.exists():
            print(f"MISSING {path}", file=sys.stderr)
            return 1
        print(f"parsing {path.name} ...")
        r = parse_file(path, label)
        print(f"  people={len(r.people)} errors={len(r.errors)}")
        all_people.extend(r.people)
        all_errors.extend(r.errors)

    sql_out = args.sql_out or (repo / "deploy" / "mysql" / "daikao-import.sql")
    sql_out.parent.mkdir(parents=True, exist_ok=True)
    print(f"writing {sql_out} ...")
    emit_sql(all_people, all_errors, sql_out)
    print(
        f"done people={len(all_people)} errors={len(all_errors)} sql_bytes={sql_out.stat().st_size}"
    )

    if args.apply:
        schema = repo / "deploy" / "mysql" / "daikao-schema.sql"
        remote_dir = "~/kong-jiapu/import"
        subprocess.check_call(
            ["ssh", args.host, f"mkdir -p {remote_dir}"]
        )
        subprocess.check_call(
            ["scp", str(schema), str(sql_out), f"{args.host}:{remote_dir}/"]
        )
        cmd = (
            f"mysql --defaults-file=~/.my.cnf --default-character-set=utf8mb4 kzjp01 "
            f"< {remote_dir}/daikao-schema.sql && "
            f"mysql --defaults-file=~/.my.cnf --default-character-set=utf8mb4 kzjp01 "
            f"< {remote_dir}/daikao-import.sql && "
            f"mysql --defaults-file=~/.my.cnf --default-character-set=utf8mb4 kzjp01 -e \""
            f"SELECT COUNT(*) people FROM tb_daikao_people; "
            f"SELECT COUNT(*) errors FROM tb_daikao_parse_error; "
            f"SELECT source_file, COUNT(*) c FROM tb_daikao_people GROUP BY source_file; "
            f"SELECT id,name,spectrum_no,generation,group_raw,section_path,parent_name "
            f"FROM tb_daikao_people WHERE name='廣運' AND spectrum_no='002222'; "
            f"SELECT id,name,spectrum_no,generation,section_path "
            f"FROM tb_daikao_people WHERE name='宏寬' AND spectrum_no='008724';\""
        )
        print("applying on remote ...")
        subprocess.check_call(["ssh", args.host, cmd])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
