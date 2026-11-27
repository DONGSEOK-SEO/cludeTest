"""수의계약 2년 백필 실행기: 배포된 사이트의 관리용 주소를 차례로 부른다.
인증(Authorization: Bearer CRON_SECRET)은 클라우드 작업 환경의 프록시가 자동으로 붙인다(값은 코드에 없음).
다른 곳에서 돌릴 때는 아래 req() 의 headers 에 Authorization 을 넣어야 한다.
- andong·seongnam(시 홈페이지): 2년을 한 달씩 (다시 받아도 중복은 걸러짐)
- g2b: status 의 g2bMissing(최근 날짜부터)을 2개씩 동시에, 하루 한도(quota) 오류가 나면 멈춤
사용: python backfill.py [--web andong,seongnam] [--skip-g2b] [--max-days N]
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import json
import sys
import time
import urllib.error
import urllib.request

B = "https://buildtalkweb1.vercel.app"


def req(method, path, body=None, timeout=330):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(B + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {"error": f"HTTP {e.code}"}
    except Exception as e:
        return 0, {"error": str(e)}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--web", default="andong,seongnam", help="한 달씩 받을 시 홈페이지(쉼표로 구분, 빈 값이면 건너뜀)")
    ap.add_argument("--skip-g2b", action="store_true")
    ap.add_argument("--max-days", type=int, default=800)
    a = ap.parse_args()

    st, s = req("GET", "/api/admin/contracts/status", timeout=120)
    if st != 200:
        sys.exit(f"status 실패: {st} {s}")
    frm, to = s["range"]["from"], s["range"]["to"]
    log("범위", frm, "~", to, "| g2b 남은 날짜", len(s["g2bMissing"]))

    webs = [w for w in a.web.split(",") if w]
    start = dt.date(int(frm[:4]), int(frm[4:6]), int(frm[6:]))
    end = dt.date(int(to[:4]), int(to[4:6]), int(to[6:]))
    for web in webs:
        cur = end
        while cur >= start:
            m_from = max(start, cur.replace(day=1))
            body = {"source": web, "from": m_from.strftime("%Y%m%d"), "to": cur.strftime("%Y%m%d")}
            for attempt in range(3):
                st, r = req("POST", "/api/admin/contracts/collect", body)
                if st == 200 and r.get("complete"):
                    break
                time.sleep(20 * (attempt + 1))
            log(web, m_from, "~", cur, st, {k: r.get(k) for k in ("siteTotal", "received", "added", "complete", "error")})
            if st != 200:
                log(web, "수집 실패, 다음 달로 넘어감")
            cur = m_from - dt.timedelta(days=1)

    if a.skip_g2b:
        return
    days = s["g2bMissing"][: a.max_days]
    stop = False

    def one(day):
        st, r = req("POST", "/api/admin/contracts/collect", {"source": "g2b", "day": day})
        return day, st, r

    with cf.ThreadPoolExecutor(max_workers=2) as ex:
        it = iter(days)
        futs = {ex.submit(one, d) for d in [next(it, None), next(it, None)] if d}
        done_n = 0
        while futs:
            fin, futs = cf.wait(futs, return_when=cf.FIRST_COMPLETED)
            for f in fin:
                day, st, r = f.result()
                done_n += 1
                err = str(r.get("error", ""))
                log("g2b", day, st, {k: r.get(k) for k in ("national", "found", "added", "calls")} if st == 200 else err[:150])
                if "한도" in err or "quota" in err.lower() or "LIMITED" in err:
                    stop = True
                if not stop:
                    nxt = next(it, None)
                    if nxt:
                        futs.add(ex.submit(one, nxt))
        log("g2b 처리", done_n, "일", "(한도로 중단)" if stop else "")


if __name__ == "__main__":
    main()
