"""
BIST şirket isimlerini yfinance üzerinden toplu çeker ve bist_names.json dosyasına yazar.
Kullanım: python -m app.scripts.fetch_names  (backend/ klasöründen)
"""
import json
import time
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent   # backend/app/scripts/
_APP_DIR     = _SCRIPTS_DIR.parent               # backend/app/
_MKT_UNI     = _APP_DIR / "features" / "market_data" / "assets" / "universe"

_UNIVERSE = _MKT_UNI / "bist_all.csv"
# universe_bist.py reads from market_data/assets/universe/bist_names.json
_TARGET   = _MKT_UNI / "bist_names.json"


def _read_symbols() -> list[str]:
    """bist_all.csv'den sembol listesini okur."""
    lines = _UNIVERSE.read_text(encoding="utf-8").splitlines()
    return [l.strip() for l in lines[1:] if l.strip()]


def _fetch_via_yfinance(symbols: list[str]) -> dict[str, str]:
    """yfinance ile toplu isim çeker; .IS suffix'i BIST için gerekli."""
    try:
        import yfinance as yf
    except ImportError:
        print("yfinance kurulu değil. 'pip install yfinance' çalıştırın.")
        return {}

    result = {}
    batch_size = 50
    batches = [symbols[i:i + batch_size] for i in range(0, len(symbols), batch_size)]

    for idx, batch in enumerate(batches):
        tickers_str = " ".join(f"{s}.IS" for s in batch)
        print(f"  Batch {idx + 1}/{len(batches)}: {len(batch)} sembol çekiliyor...")
        try:
            tickers = yf.Tickers(tickers_str)
            for sym in batch:
                key = f"{sym}.IS"
                try:
                    info = tickers.tickers[key].fast_info
                    # fast_info doesn't have name; fall back to .info for name only
                    name = tickers.tickers[key].info.get("longName") or tickers.tickers[key].info.get("shortName")
                    if name:
                        result[sym] = name
                    else:
                        print(f"    {sym}: isim bulunamadı")
                except Exception as e:
                    print(f"    {sym}: hata – {e}")
        except Exception as e:
            print(f"  Batch hatası: {e}")
        if idx < len(batches) - 1:
            time.sleep(1)

    return result


def _fetch_via_yfinance_single(symbols: list[str]) -> dict[str, str]:
    """Toplu çekim başarısız olursa tek tek dener."""
    try:
        import yfinance as yf
    except ImportError:
        return {}

    result = {}
    for i, sym in enumerate(symbols):
        try:
            info = yf.Ticker(f"{sym}.IS").info
            name = info.get("longName") or info.get("shortName")
            if name:
                result[sym] = name
                print(f"  [{i+1}/{len(symbols)}] {sym}: {name}")
            else:
                print(f"  [{i+1}/{len(symbols)}] {sym}: isim yok")
        except Exception as e:
            print(f"  [{i+1}/{len(symbols)}] {sym}: hata – {e}")
        if i % 20 == 19:
            time.sleep(1)

    return result


def run():
    symbols = _read_symbols()
    print(f"{len(symbols)} sembol okundu. yfinance ile çekiliyor...")

    # Mevcut JSON'u oku (üzerine yaz değil, merge et)
    existing: dict = {}
    if _TARGET.exists():
        try:
            existing = json.loads(_TARGET.read_text(encoding="utf-8"))
        except Exception:
            pass

    missing = [s for s in symbols if s not in existing]
    print(f"Eksik isim: {len(missing)} / {len(symbols)}")

    if not missing:
        print("Tüm isimler mevcut, güncelleme gerekmez.")
        return

    fetched = _fetch_via_yfinance(missing)

    # Toplu çekim boş döndüyse tek tek dene
    if not fetched:
        print("Toplu çekim başarısız, tek tek deneniyor...")
        fetched = _fetch_via_yfinance_single(missing)

    merged = {**existing, **fetched}
    _TARGET.parent.mkdir(parents=True, exist_ok=True)
    _TARGET.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nTamamlandı: {len(merged)} isim kaydedildi → {_TARGET}")
    print(f"Bulunan: {len(fetched)}, Hâlâ eksik: {len(missing) - len(fetched)}")


if __name__ == "__main__":
    run()
