"""D02 국내 부대비용 조회기 — 데이터 빌드 스크립트 (v2, DG 포함)
aside 원천 데이터(raw/aside-YYYY-MM-DD/)에서 부산항 수출 대표값 JSON을 만든다.
사용: python scripts/build_busan_export.py [원천폴더] [출력파일]
"""
import pandas as pd, json, sys, os, re
SRC = sys.argv[1] if len(sys.argv) > 1 else 'raw/aside-2026-10-20'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'data/local-charge-busan-export.json'
CHECKED_AT = '2026-10-20'
r = pd.read_csv(f'{SRC}/korea_local_charges_rows.csv', dtype=str).fillna('')
c = pd.read_csv(f'{SRC}/korea_local_charges_carriers.csv', dtype=str).fillna('')

ITEMS = [  # key, group, label, unit, 적용 컨테이너종류
 ('THC_DRY_20','THC',"THC 20' DRY",'PER_CNTR','DRY'),('THC_DRY_40','THC',"THC 40' DRY",'PER_CNTR','DRY'),
 ('THC_DG_20','THC',"THC 20' DG",'PER_CNTR','DG'),('THC_DG_40','THC',"THC 40' DG",'PER_CNTR','DG'),
 ('THC_OOG_20','THC',"THC 20' OT·FR",'PER_CNTR','OOG'),('THC_OOG_40','THC',"THC 40' OT·FR",'PER_CNTR','OOG'),
 ('THC_RF_20','THC',"THC 20' RF",'PER_CNTR','RF'),('THC_RF_40','THC',"THC 40' RF",'PER_CNTR','RF'),
 ('WHARFAGE_20','W/FAG',"W/FAG 20'",'PER_CNTR','ALL'),('WHARFAGE_40','W/FAG',"W/FAG 40'",'PER_CNTR','ALL'),
 ('SECURITY_20','PFS',"PFS 항만시설보안료 20'",'PER_CNTR','ALL'),('SECURITY_40','PFS',"PFS 항만시설보안료 40'",'PER_CNTR','ALL'),
 ('PORT_SAFETY_20','PSC',"PSC 항만안전관리비 20'",'PER_CNTR','ALL'),('PORT_SAFETY_40','PSC',"PSC 항만안전관리비 40'",'PER_CNTR','ALL'),
 ('SEAL','SEAL','SEAL','PER_CNTR','ALL'),
 ('DOC_FEE','DOCS FEE','DOCS FEE','PER_BL','ALL'),('DOC_FEE_DG','DOCS FEE','DOCS FEE (위험물)','PER_BL','DG'),
 ('DG_SURCHARGE','기타',"DG 처리 할증",'PER_CNTR','DG')]
KEYS = [i[0] for i in ITEMS]

b = r[(r.charge_category=='LOCAL') & (r.effective_to=='') & (~r.trade_scope.str.contains('LCL')) & (r.direction.isin(['EXPORT','BOTH']))
      & (r.port.isin(['KRPUS','ALL','KRPUS,KRINC','KRPNC','KRBNP'])) & (r.currency=='KRW')].copy()
b['amt'] = pd.to_numeric(b.amount, errors='coerce')
txt = (b.remark + ' ' + b.charge_name)
# DG 행 중 리퍼·특수·탱크 기반은 제외 (드라이 위험물만 DG로 취급)
NON_DRY_DG = re.compile(r'RF\(DG\)|RH\(DG\)|RE\(DG\)|OT\(DG\)|FR\(DG\)|SR\(DG\)|UT\(DG\)|PC\(DG\)|TK\(DG\)|base type (?:REEFER|OOG|ALL)|Reefer|Tank|Flat Rack|Open Top', re.I)
b['dg_dry'] = ~txt.str.contains(NON_DRY_DG)

def key(x):
    s, ct, cn = x.charge_std, x.cargo_type, ('40' if x.container=='40HC' else x.container)
    if s=='THC' and cn in ('20','40'):
        if ct=='DG': return f'THC_DG_{cn}' if x.dg_dry else None
        m = {'DRY':'DRY','ALL':'DRY','OOG':'OOG','REEFER':'RF'}.get(ct)
        return f'THC_{m}_{cn}' if m else None
    if s in ('WHARFAGE','SECURITY','PORT_SAFETY') and cn in ('20','40'): return f'{s}_{cn}'
    if s=='SEAL': return None if re.search(r'Extra|추가', x.charge_name, re.I) else 'SEAL'
    if s=='DOC_FEE' and x.unit=='PER_BL': return 'DOC_FEE_DG' if ct=='DG' or re.search(r'\(DG\)', x.charge_name) else 'DOC_FEE'
    if s=='OTHER' and x.unit=='PER_CNTR' and re.search(r'DG Surcharge|Hazardous Shipment', x.charge_name, re.I): return 'DG_SURCHARGE'
b['k'] = b.apply(key, axis=1); b = b[b.k.notna()]

# 대표값 우선순위: 부산 정확일치 > 전 항로/한중·아시아 항로 > IMO 3~9급 > 최신 발효일
ASIA = re.compile(r'^ALL|Intra Asia|INTRA ASIA|Korea-China|Korea-Japan|W-bound|CMA CGM/ANL/APL', re.I)
b['pp'] = (b.port!='KRPUS').astype(int)
b['tp'] = (~b.trade_scope.str.contains(ASIA)).astype(int)
b['cp'] = b.remark.str.contains(r'class 1,2,7', case=False).astype(int)
b = b.sort_values(['carrier_id','k','pp','tp','cp','effective_from'], ascending=[1,1,1,1,1,0])
g = b.groupby(['carrier_id','k'])
rep = g.first()[['amt','charge_name','effective_from','source_url','trade_scope','remark']]
rep['min'] = g.amt.min(); rep['max'] = g.amt.max(); rep['n_values'] = g.amt.nunique()

nat = dict(zip(c.carrier_id, c.nationality)); nat['esl'] = '외국적'
WFG_INCL_SECURITY = {'dongjin','pancon','cmacgm','hapag','yangming'}   # 부산 W/FAG 4,574/9,148 = 4,429/8,858 + 보안료
STALE = {'doowoo','panstar'}                                            # aside 경고: 오래된 공지

# 추정 규칙: 같은 국적구분 그룹에서 확인 선사 5곳 이상 + 최빈값 점유율 50% 이상이면 최빈값, 아니면 범위
def estimate(k, group):
    if k in ('DOC_FEE_DG','DG_SURCHARGE'): return None          # 선사 고유 항목은 추정하지 않음
    s = rep[rep.index.get_level_values('k')==k].amt
    s.index = s.index.get_level_values('carrier_id')
    gs = s[[nat.get(i)==group for i in s.index]]
    basis = gs if len(gs) >= 5 else s
    label = group if len(gs) >= 5 else '전체'
    if len(basis) < 5: return None
    m = basis.mode().iloc[0]; share = int((basis==m).sum())
    if share / len(basis) >= 0.5:
        return {'type':'mode','amount':float(m),'basis_group':label,'n_same':share,'n_total':int(len(basis))}
    return {'type':'range','range':[float(basis.min()),float(basis.max())],'basis_group':label,'n_total':int(len(basis))}

carriers = c[['carrier_id','name_ko','name_en','nationality','status','page_url']].to_dict('records')
carriers.append({'carrier_id':'esl','name_ko':'ESL(Emirates Shipping Line)','name_en':'ESL','nationality':'외국적','status':'NOT_COLLECTED','page_url':''})
out = []
for cr in carriers:
    cid = cr['carrier_id']; vals = {}
    for k in KEYS:
        if (cid, k) in rep.index:
            x = rep.loc[(cid, k)]
            st = '확인(오래된 공지)' if cid in STALE or (cid=='evergreen' and k.startswith('SECURITY')) else '확인'
            vals[k] = {'status':st,'amount':float(x.amt),
                       'range':[float(x['min']),float(x['max'])] if x.n_values>1 else None,
                       'charge_name':x.charge_name,'trade_scope':x.trade_scope,'effective_from':x.effective_from,'source_url':x.source_url}
        elif cid=='maersk' and k.startswith('WHARFAGE'): vals[k] = {'status':'THC에 포함'}
        elif cid in WFG_INCL_SECURITY and k.startswith('SECURITY'): vals[k] = {'status':'W/FAG에 포함(추정)'}
        elif k=='DOC_FEE_DG': vals[k] = {'status':'일반 서류비 적용'}
        elif k=='DG_SURCHARGE': vals[k] = {'status':'해당 없음'}
        else:
            e = estimate(k, nat.get(cid))
            vals[k] = {'status':'미확인','estimate':e} if e else {'status':'미확인'}
    out.append({**cr, 'values': vals})
os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
json.dump({'meta':{'tool':'D02 국내 부대비용 조회기','scope':'부산항 수출 · 현재 유효 요율 · KRW',
                   'source':'각 선사 공식 사이트 공개 Tariff(로그인 없이 확인 가능한 조회툴·PDF·HTML)',
                   'checked_at':CHECKED_AT,'carriers':len(out),'items':len(KEYS),
                   'dg_basis':'드라이 컨테이너 위험물, 한중·아시아 항로, IMO 3~9급 우선'},
           'items':[dict(zip(['key','group','label','unit','applies_to'],i)) for i in ITEMS],
           'carriers':out}, open(OUT,'w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('carriers', len(out))
