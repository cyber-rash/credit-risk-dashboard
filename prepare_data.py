"""Təhlil üçün işçi məlumatı və pano üçün qruplaşdırılmış göstəriciləri hazırla."""

import json
from pathlib import Path

import numpy as np
import pandas as pd
from plotly.offline import get_plotlyjs

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "data" / "cs-training.csv"
TARGET = "SeriousDlqin2yrs"
UTILIZATION = "RevolvingUtilizationOfUnsecuredLines"
LATE = [
    "NumberOfTime30-59DaysPastDueNotWorse",
    "NumberOfTime60-89DaysPastDueNotWorse",
    "NumberOfTimes90DaysLate",
]
FILTERS = ["age", "income", "late", "utilization"]
DIMENSIONS = [*FILTERS, "debt"]
LABELS = {
    "age": ["18–29", "30–44", "45–59", "60–74", "75 və yuxarı", "Naməlum"],
    "income": ["0", "1–2 999", "3 000–5 999", "6 000–9 999", "10 000 və yuxarı", "Naməlum"],
    "late": ["Gecikmə yoxdur", "1 gecikmə", "2–3 gecikmə", "4 və daha çox", "Naməlum"],
    "utilization": ["25%-dən az", "25%–50%-dən az", "50%–100%", "100%-dən çox", "Naməlum"],
    "debt": ["25%-dən az", "25%–50%-dən az", "50%–100%", "100%-dən çox", "Naməlum"],
}
METRICS = ["count", "events", "age_sum", "age_count", "income_sum", "income_count"]


def clean_data(raw):
    """Şübhəli dəyərləri işçi nüsxədə naməlum kimi işarələ."""
    if not raw[TARGET].isin([0, 1]).all():
        raise ValueError("Hədəf sütununda gözlənilməyən dəyər var.")
    data = raw.drop(columns="Unnamed: 0").copy()
    data["age"] = data["age"].where(np.isfinite(data["age"]) & data["age"].ge(18))
    for column in ["MonthlyIncome", "NumberOfDependents", "DebtRatio", UTILIZATION, *LATE]:
        values = data[column]
        data[column] = values.where(np.isfinite(values) & values.ge(0))
    data[LATE] = data[LATE].mask(data[LATE].isin([96, 98]))
    return data


def segment_data(data):
    """Qrafiklər və filtrlər üçün sərhədləri qarşılıqlı kəsişməyən qruplar yarat."""
    age = data["age"]
    income = data["MonthlyIncome"]
    late = data[LATE].sum(axis=1, min_count=len(LATE))
    groups = pd.DataFrame(index=data.index)
    groups["age"] = np.select(
        [age.lt(30), age.lt(45), age.lt(60), age.lt(75), age.ge(75)],
        [0, 1, 2, 3, 4], default=5,
    )
    groups["income"] = np.select(
        [income.eq(0), income.lt(3000), income.lt(6000), income.lt(10000), income.ge(10000)],
        [0, 1, 2, 3, 4], default=5,
    )
    groups["late"] = np.select(
        [late.eq(0), late.eq(1), late.between(2, 3), late.ge(4)],
        [0, 1, 2, 3], default=4,
    )
    for key, column in [("utilization", UTILIZATION), ("debt", "DebtRatio")]:
        ratio = data[column]
        groups[key] = np.select(
            [ratio.lt(0.25), ratio.lt(0.5), ratio.le(1), ratio.gt(1)],
            [0, 1, 2, 3], default=4,
        )
    return groups


def summarize(data, groups):
    """Yalnız sayları və cəmləri ixrac et ki, filtrdən sonra ortalar düzgün hesablansın."""
    combined = groups.assign(target=data[TARGET], years=data["age"], earnings=data["MonthlyIncome"])
    return combined.groupby(DIMENSIONS, sort=True).agg(
        count=("target", "size"),
        events=("target", "sum"),
        age_sum=("years", "sum"),
        age_count=("years", "count"),
        income_sum=("earnings", "sum"),
        income_count=("earnings", "count"),
    ).reset_index()


def main():
    raw = pd.read_csv(SOURCE)
    data = clean_data(raw)
    grouped = summarize(data, segment_data(data))
    assert len(raw) == len(data) == grouped["count"].sum()
    assert raw[TARGET].sum() == grouped["events"].sum()
    assert data["MonthlyIncome"].count() == grouped["income_count"].sum()
    assert np.isclose(data["MonthlyIncome"].sum(), grouped["income_sum"].sum())
    assert data["age"].count() == grouped["age_count"].sum()
    assert np.isclose(data["age"].sum(), grouped["age_sum"].sum())
    payload = {
        "dimensions": DIMENSIONS,
        "metrics": METRICS,
        "labels": LABELS,
        "rows": grouped.to_numpy().tolist(),
    }
    assets = ROOT / "dashboard" / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    (assets / "data.js").write_text(
        "window.creditData=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + ";\n",
        encoding="utf-8",
    )
    (assets / "plotly.min.js").write_text(get_plotlyjs(), encoding="utf-8")
    records = f"{len(data):,}".replace(",", " ")
    group_count = f"{len(grouped):,}".replace(",", " ")
    print(f"{records} sətir üzrə {group_count} qrup panoya ixrac edildi.")


if __name__ == "__main__":
    main()
