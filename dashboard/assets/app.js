"use strict";

const { dimensions, metrics, labels, rows } = window.creditData ?? {};
const keys = ["age", "income", "late", "utilization"];
const number = new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("az-AZ", { style: "percent", maximumFractionDigits: 2 });
const palette = { teal: "#08766d", pale: "#79b7bf", navy: "#213c59" };
const formatNumber = (value) => value == null ? "—" : number.format(value);
const formatPercent = (value) => value == null ? "—" : percent.format(value);
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
const element = (id) => document.getElementById(id);

function aggregate(selection) {
  const total = Object.fromEntries(metrics.map((key) => [key, 0]));
  const segments = Object.fromEntries(dimensions.map((key) => [
    key, labels[key].map((label) => ({ label, count: 0, events: 0 })),
  ]));
  rows.forEach((row) => {
    if (selection.some((value, index) => value !== "" && Number(value) !== row[index])) return;
    metrics.forEach((key, index) => { total[key] += row[dimensions.length + index]; });
    dimensions.forEach((key, index) => {
      const segment = segments[key][row[index]];
      segment.count += row[dimensions.length];
      segment.events += row[dimensions.length + 1];
    });
  });
  return { total, segments };
}

function reportKpis(total) {
  const values = {
    count: formatNumber(total.count),
    events: formatNumber(total.events),
    rate: formatPercent(ratio(total.events, total.count)),
    age: formatNumber(ratio(total.age_sum, total.age_count)),
    income: formatNumber(ratio(total.income_sum, total.income_count)),
    missing: formatPercent(ratio(total.count - total.income_count, total.count)),
  };
  Object.entries(values).forEach(([key, value]) => { element("kpi-" + key).textContent = value; });
}

function drawChart(id, groups, isDistribution, hasRows) {
  const values = groups.map((group) => isDistribution ? group.count : ratio(group.events, group.count));
  const barLabels = groups.map((group, index) => {
    if (values[index] == null) return "";
    return isDistribution ? formatNumber(values[index]) : formatPercent(values[index]);
  });
  const trace = {
    type: "bar",
    orientation: "h",
    x: hasRows ? values : [],
    y: hasRows ? groups.map((group) => group.label) : [],
    text: barLabels,
    textposition: "outside",
    cliponaxis: false,
    marker: { color: isDistribution ? [palette.pale, palette.teal] : palette.teal },
    customdata: groups.map((group) => [
      formatNumber(group.count), formatNumber(group.events),
      formatPercent(ratio(group.events, group.count)),
    ]),
    hovertemplate: isDistribution
      ? "<b>%{y}</b><br>Müşahidə sayı: %{customdata[0]}<extra></extra>"
      : "<b>%{y}</b><br>Ciddi gecikmə payı: %{customdata[2]}<br>Ciddi gecikmə sayı: %{customdata[1]}<br>Müşahidə sayı: %{customdata[0]}<extra></extra>",
  };
  return Plotly.react(element("chart-" + id), [trace], {
    margin: { l: 5, r: 32, t: 12, b: 32 },
    font: { family: "Segoe UI, system-ui, sans-serif", size: 12, color: palette.navy },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    showlegend: false,
    dragmode: false,
    bargap: .43,
    separators: ", ",
    yaxis: { autorange: "reversed", automargin: true, fixedrange: true, visible: hasRows },
    xaxis: {
      tickformat: isDistribution ? ",d" : ".0%",
      separatethousands: true,
      rangemode: "tozero",
      gridcolor: "#e3ebf2",
      zeroline: false,
      fixedrange: true,
      visible: hasRows,
    },
    annotations: hasRows ? [] : [{
      text: "Bu seçim üzrə məlumat yoxdur",
      x: .5, y: .5, xref: "paper", yref: "paper", showarrow: false,
    }],
  }, { responsive: true, displayModeBar: false, displaylogo: false });
}

function reportInsights(total, segments, baseline) {
  const list = element("insight-list");
  list.replaceChildren();
  if (!total.count) {
    const item = document.createElement("li");
    item.textContent = "Bu filtr seçimi üzrə müşahidə yoxdur.";
    list.append(item);
    return;
  }
  const currentRate = ratio(total.events, total.count);
  const baseRate = ratio(baseline.events, baseline.count);
  const notes = [
    `Seçimdə ${formatNumber(total.count)} müşahidə və ${formatNumber(total.events)} ciddi ödəniş gecikməsi var. Hadisənin payı ${formatPercent(currentRate)} təşkil edir.`,
  ];
  if (total.count !== baseline.count) {
    const delta = Math.abs((currentRate - baseRate) * 100);
    const direction = currentRate >= baseRate ? "yuxarıdır" : "aşağıdır";
    const comparison = delta < .005
      ? "Fərq 0,005 faiz bəndindən azdır."
      : `Seçim üzrə pay bu göstəricidən ${formatNumber(delta)} faiz bəndi ${direction}.`;
    notes.push(`Bütün nümunədə ciddi gecikmə payı ${formatPercent(baseRate)} təşkil edir. ${comparison}`);
  }
  const [noLate, , , manyLate] = segments.late;
  if (noLate.count && manyLate.count) {
    notes.push(`Ciddi gecikmə payı tarixçəsində gecikmə qeydə alınmayan qrupda ${formatPercent(ratio(noLate.events, noLate.count))} (müşahidə sayı ${formatNumber(noLate.count)}), 4 və daha çox gecikməsi olan qrupda isə ${formatPercent(ratio(manyLate.events, manyLate.count))} (müşahidə sayı ${formatNumber(manyLate.count)}) təşkil edir.`);
  }
  const missing = total.count - total.income_count;
  notes.push(`Aylıq gəlir ${formatNumber(missing)} müşahidədə göstərilməyib (${formatPercent(ratio(missing, total.count))}). Orta aylıq gəlirin hesablanmasında gəliri məlum olan ${formatNumber(total.income_count)} müşahidə nəzərə alınır.`);
  notes.forEach((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    list.append(item);
  });
}

async function render(selection, baseline) {
  const { total, segments } = aggregate(selection);
  reportKpis(total);
  reportInsights(total, segments, baseline);
  element("status").textContent = total.count
    ? `Seçilmiş müşahidə sayı ${formatNumber(total.count)} / ${formatNumber(baseline.count)}`
    : "Bu filtr seçimi üzrə müşahidə yoxdur.";
  const target = [
    { label: "Ciddi gecikmə yoxdur", count: total.count - total.events },
    { label: "Ciddi gecikmə var", count: total.events },
  ];
  await Promise.all([
    drawChart("target", target, true, Boolean(total.count)),
    ...dimensions.map((key) => drawChart(key, segments[key], false, Boolean(total.count))),
  ]);
}

function initialize() {
  if (!window.Plotly || !rows) throw new Error("İdarə paneli üçün tələb olunan fayllar yüklənmədi.");
  const controls = keys.map((key) => element(key));
  controls.forEach((control, index) => {
    labels[keys[index]].forEach((label, value) => control.add(new Option(label, String(value))));
    control.addEventListener("change", update);
  });
  const baseline = aggregate(keys.map(() => "")).total;
  element("reset").addEventListener("click", () => {
    controls.forEach((control) => { control.value = ""; });
    update();
  });
  update();

  function update() {
    render(controls.map((control) => control.value), baseline).catch(reportError);
  }
}

function reportError(error) {
  element("status").textContent = "İdarə panelini göstərmək mümkün olmadı. Səhifəni yenidən yükləyin.";
  console.error(error);
}

try {
  initialize();
} catch (error) {
  reportError(error);
}
