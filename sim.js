/* Live energy-system "digital twin" mini-model (illustrative, not the validated PyPSA runs).
   24h greedy dispatch with a choice of storage technology, season, and a tariff so it can
   estimate annual £ saving and a rough payback. Vanilla JS, no deps. Respects the site's
   CSS variables and prefers-reduced-motion. */
(function () {
  "use strict";
  const HOURS = 24, CO2_KG_PER_KWH = 0.233;

  // Storage technology parameters (round-trip split into store/dispatch, plus £/kWh capex).
  const TECH = {
    battery:  { name: "Li-ion battery", etaS: 0.95, etaD: 0.95, cRate: 3, capex: 300 },
    hydrogen: { name: "Hydrogen",       etaS: 0.70, etaD: 0.50, cRate: 6, capex: 600 }, // low round-trip
    thermal:  { name: "Thermal (PCM)",  etaS: 0.95, etaD: 0.92, cRate: 8, capex: 60  }, // cheap, heat only
  };

  function profiles(season) {
    const demand = [], pv = [];
    const solarPeak = season === "winter" ? 380 : 950;   // high-latitude seasonal swing
    const solarWidth = season === "winter" ? 16 : 12;    // shorter winter day
    const eveWeight = season === "winter" ? 430 : 300;   // bigger winter evening peak (heating)
    for (let h = 0; h < HOURS; h++) {
      const d = 180 + 300 * Math.exp(-((h - 9) ** 2) / 7) + eveWeight * Math.exp(-((h - 19) ** 2) / 5);
      const day = Math.max(0, Math.sin((h - 6) / solarWidth * Math.PI));
      demand.push(d); pv.push(day * solarPeak);
    }
    return { demand, pv };
  }

  function dispatch(demand, pv, capKWh, tech) {
    const t = TECH[tech], powerKW = Math.max(50, capKWh / t.cRate);
    let soc = 0; const grid = [];
    for (let h = 0; h < HOURS; h++) {
      let net = demand[h] - pv[h];
      if (net < 0) {
        const charge = Math.min(-net, powerKW, capKWh - soc);
        soc += charge * t.etaS; grid.push(0);
      } else {
        const dis = Math.min(net, powerKW, soc * t.etaD);
        soc -= dis / t.etaD; grid.push(Math.max(0, net - dis));
      }
    }
    return { grid, powerKW };
  }

  const sum = a => a.reduce((x, y) => x + y, 0);

  function economics(demand, pv, grid, capKWh, tech, tariff) {
    const totDem = sum(demand), totImp = sum(grid);
    const served = totDem - totImp, pvUsed = Math.min(sum(pv), served);
    const solarFrac = 100 * pvUsed / totDem;
    const basePeak = Math.max(...demand), newPeak = Math.max(...grid);
    const peakRed = 100 * (basePeak - newPeak) / basePeak;
    const co2 = pvUsed * CO2_KG_PER_KWH / 1000; // t/day

    // annualised £ saving vs a no-storage baseline (import all net demand from grid)
    const baseGrid = demand.map((d, i) => Math.max(0, d - pv[i]));
    const days = 365;
    const eKWh = tariff.energy / 1000; // £/kWh
    const capCharge = tariff.capacity; // £/kW/yr on peak
    const baseCost = sum(baseGrid) * days * eKWh + Math.max(...baseGrid) * capCharge;
    const newCost  = totImp * days * eKWh + newPeak * capCharge;
    const saveYr = baseCost - newCost;
    const capex = capKWh * TECH[tech].capex;
    const payback = saveYr > 0 ? capex / saveYr : Infinity;
    return { solarFrac, peakRed, co2, saveYr, payback, capex };
  }

  function cssVar(n, f) { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || f; }

  function mount(canvas, ctrl, out) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ctx = canvas.getContext("2d");
    let hover = -1;
    const state = { tech: "battery", season: "summer" };

    function resize() { const r = canvas.getBoundingClientRect(); canvas.width = r.width * dpr; canvas.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

    function draw() {
      const { demand, pv } = profiles(state.season);
      const cap = +ctrl.cap.value;
      const { grid, powerKW } = dispatch(demand, pv, cap, state.tech);
      const tariff = { energy: +ctrl.energy.value, export: +ctrl.exp.value, capacity: +ctrl.capacity.value };
      const e = economics(demand, pv, grid, cap, state.tech, tariff);

      const r = canvas.getBoundingClientRect(), W = r.width, H = r.height, pad = 22;
      const maxY = Math.max(...demand, ...pv) * 1.05;
      const X = i => pad + i / (HOURS - 1) * (W - 2 * pad), Y = v => H - pad - v / maxY * (H - 2 * pad);
      ctx.clearRect(0, 0, W, H);
      const accent = cssVar("--accent", "#1D6A5A"), ochre = cssVar("--ochre", "#9E6C14"),
        rule = cssVar("--rule", "#ccc"), muted = cssVar("--muted", "#666");
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); grid.forEach((v, i) => ctx.lineTo(X(i), Y(v))); ctx.lineTo(X(HOURS - 1), Y(0)); ctx.closePath();
      ctx.fillStyle = accent + "22"; ctx.fill();
      const line = (arr, col, w) => { ctx.beginPath(); arr.forEach((v, i) => { const x = X(i), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
      line(pv, ochre, 2); line(demand, muted, 1.5); line(grid, accent, 2.6);
      if (hover >= 0 && hover < HOURS) {
        const x = X(hover); ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke();
        ctx.fillStyle = muted; ctx.font = "11px 'IBM Plex Mono',monospace";
        ctx.fillText(`${hover}:00  import ${Math.round(grid[hover])} kW`, Math.min(x + 6, W - 130), pad + 12);
      }
      out.solar.textContent = e.solarFrac.toFixed(1) + "%";
      out.peak.textContent = e.peakRed.toFixed(0) + "%";
      out.co2.textContent = e.co2.toFixed(2) + " t/day";
      out.save.textContent = e.saveYr >= 1000 ? "£" + (e.saveYr / 1000).toFixed(1) + "k/yr" : "£" + Math.round(e.saveYr) + "/yr";
      out.payback.textContent = isFinite(e.payback) ? e.payback.toFixed(1) + " yr" : "—";
      out.capval.textContent = cap + " kWh · " + Math.round(powerKW) + " kW";
      out.capLbl.textContent = "(" + cap + " kWh)";
    }

    // wire controls
    canvas.addEventListener("pointermove", ev => { const r = canvas.getBoundingClientRect(); hover = Math.round((ev.clientX - r.left - 22) / (r.width - 44) * (HOURS - 1)); draw(); });
    canvas.addEventListener("pointerleave", () => { hover = -1; draw(); });
    ["cap", "energy", "exp", "capacity"].forEach(k => ctrl[k].addEventListener("input", draw));
    ctrl.techBtns.forEach(b => b.addEventListener("click", () => { state.tech = b.dataset.tech; ctrl.techBtns.forEach(x => x.classList.toggle("on", x === b)); draw(); }));
    ctrl.seasonBtns.forEach(b => b.addEventListener("click", () => { state.season = b.dataset.season; ctrl.seasonBtns.forEach(x => x.classList.toggle("on", x === b)); draw(); }));
    window.addEventListener("resize", () => { resize(); draw(); });
    document.addEventListener("themechange", draw);
    resize(); draw();
  }
  window.EnergySim = { mount };
})();
