function renderMonthMatrix(container, rows, monthKey, cellContent) {
  const years = new Map();
  rows.forEach((row, index) => {
    const [year, month] = monthKey(row).split("-");
    if (!years.has(year)) years.set(year, new Map());
    years.get(year).set(Number(month), [row, index]);
  });
  const table = document.createElement("table");
  table.className = "month-matrix";
  const caption = table.createCaption();
  caption.textContent = "Monthly activity by year";
  const header = table.createTHead().insertRow();
  const format = new Intl.DateTimeFormat("en", {month: "short", timeZone: "UTC"});
  for (const name of ["Year", ...Array.from({length: 12}, (_, i) => format.format(Date.UTC(2025, i)))]) {
    const label = document.createElement("th");
    label.scope = "col";
    label.textContent = name;
    header.append(label);
  }
  const body = table.createTBody();
  for (const [year, months] of [...years].sort(([a], [b]) => b.localeCompare(a))) {
    const row = body.insertRow();
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = year;
    row.append(label);
    for (let month = 1; month <= 12; month++) {
      const cell = row.insertCell();
      const entry = months.get(month);
      if (entry) cell.append(cellContent(...entry));
      else cell.textContent = "—";
    }
  }
  container.replaceChildren(table);
}
