"""D02 국내 부대비용 조회기 — 공개 데이터 CSV 만들기 (표준 라이브러리만, pandas 필요 없음)
data/local-charge-busan-export.json → data/local-charge-busan-export.csv
1줄 = 선사 × 항목 1칸 (39개 선사 × 18개 항목 = 702줄). 엑셀 피벗·AI 입력용. UTF-8 BOM.
사용: python scripts/local_charge_csv.py [입력 JSON] [출력 CSV]
"""
import csv, json, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else 'data/local-charge-busan-export.json'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'data/local-charge-busan-export.csv'

d = json.load(open(SRC, encoding='utf-8'))
items = {i['key']: i for i in d['items']}
UNIT = {'PER_CNTR': '컨테이너당', 'PER_BL': 'B/L당'}
num = lambda x: '' if x is None else (int(x) if float(x).is_integer() else x)

head = ['기준일', '선사ID', '선사', '선사(영문)', '국적구분', '항목키', '항목', '단위', '적용', '상태',
        '금액', '범위최저', '범위최고', '추정방식', '추정금액', '추정최저', '추정최고', '추정근거',
        '발효일', '출처', '선사 Tariff 페이지']
rows = []
for c in d['carriers']:
    for key, v in c['values'].items():
        it = items[key]
        e = v.get('estimate') or {}
        rng = v.get('range') or [None, None]
        erng = e.get('range') or [None, None]
        basis = ''
        if e.get('type') == 'mode':
            basis = f"확인된 {e['basis_group']} 선사 {e['n_total']}곳 중 {e['n_same']}곳"
        elif e.get('type') == 'range':
            basis = f"확인된 {e['basis_group']} 선사 {e['n_total']}곳 범위"
        rows.append([
            d['meta']['checked_at'], c['carrier_id'], c['name_ko'], c['name_en'], c['nationality'],
            key, it['label'], UNIT.get(it['unit'], it['unit']), it['applies_to'], v['status'],
            num(v.get('amount')), num(rng[0]), num(rng[1]),
            {'mode': '최빈값', 'range': '범위'}.get(e.get('type'), ''),
            num(e.get('amount')), num(erng[0]), num(erng[1]), basis,
            v.get('effective_from', ''), v.get('source_url', ''), c.get('page_url', ''),
        ])

with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(head)
    w.writerows(rows)
print(f'rows {len(rows)} -> {OUT}')
