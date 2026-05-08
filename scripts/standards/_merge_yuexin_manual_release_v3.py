import json
from pathlib import Path

ROOT = Path('scripts')
STAMP = {"$date": "2026-05-06T00:00:00.000Z"}
OUT = ROOT / 'data' / '_import_salary_question_bank_yuexin.json'
INPUTS = [
    ROOT / 'data' / 'yuexin_part_01_hardware.jsonl',
    ROOT / 'data' / 'yuexin_part_02_personality_a.jsonl',
    ROOT / 'data' / 'yuexin_part_03_personality_b.jsonl',
    ROOT / 'standards' / '_batch_e1_yuexin.jsonl',
    ROOT / 'standards' / '_batch_e2_yuexin_clean.jsonl',
    ROOT / 'standards' / '_batch_e3_yuexin.jsonl',
    ROOT / 'standards' / '_batch_m1_yuexin.jsonl',
    ROOT / 'standards' / '_batch_m2_yuexin_part1.jsonl',
    ROOT / 'standards' / '_batch_m2_yuexin_part2.jsonl',
    ROOT / 'standards' / '_batch_h1_yuexin.jsonl',
    ROOT / 'standards' / '_batch_h1_yuexin_tail.jsonl',
    ROOT / 'standards' / '_batch_h2_yuexin_part1.jsonl',
    ROOT / 'standards' / '_batch_h2_yuexin_part2.jsonl',
    ROOT / 'standards' / '_batch_h3_yuexin.jsonl',
    ROOT / 'standards' / '_batch_h3_yuexin_tail.jsonl',
    ROOT / 'standards' / '_batch_hard_ratio_tail_yuexin.jsonl',
]
MEDIUM_KEEP_THREE_FIRST_POINTS = 25


def load_jsonl(path: Path):
    rows = []
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line:
            continue
        obj = json.loads(line)
        if 'createdAt' not in obj:
            obj['createdAt'] = STAMP
        rows.append(obj)
    return rows


all_rows = []
for path in INPUTS:
    all_rows.extend(load_jsonl(path))

medium_priority = []
seen_medium = set()
for row in all_rows:
    if row.get('section') == 'skill' and row.get('difficulty') == 'medium':
        point = row['standardPoint']
        if point not in seen_medium:
            seen_medium.add(point)
            medium_priority.append(point)
medium_keep_three = set(medium_priority[:MEDIUM_KEEP_THREE_FIRST_POINTS])

final_rows = []
kept = {}
for row in all_rows:
    if row['section'] != 'skill':
        final_rows.append(row)
        continue
    diff = row['difficulty']
    point = row['standardPoint']
    key = (diff, point)
    count = kept.get(key, 0)
    limit = None
    if diff == 'easy':
        limit = 2
    elif diff == 'medium':
        limit = 3 if point in medium_keep_three else 2
    if limit is None or count < limit:
        final_rows.append(row)
        kept[key] = count + 1

section_counts = {}
skill_difficulty = {}
for row in final_rows:
    sec = row['section']
    section_counts[sec] = section_counts.get(sec, 0) + 1
    if sec == 'skill':
        diff = row['difficulty']
        skill_difficulty[diff] = skill_difficulty.get(diff, 0) + 1

OUT.write_text(
    '\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in final_rows) + '\n',
    encoding='utf-8'
)
print('medium_keep_three:', len(medium_keep_three))
print('sections:', section_counts)
print('skill_difficulty:', skill_difficulty)
print('skill_total:', sum(skill_difficulty.values()))
print('hard_ratio:', round(skill_difficulty.get('hard', 0) / max(sum(skill_difficulty.values()), 1), 4))
print('total:', len(final_rows))
print('output:', OUT)
