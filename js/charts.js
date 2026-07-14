
export function setupCanvas(canvas, height = 260){
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(canvas.clientWidth || 640, 320);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return {context, width, height};
}

function themeColors(){
  const css = getComputedStyle(document.documentElement);
  return {
    text: css.getPropertyValue("--text").trim(),
    muted: css.getPropertyValue("--muted").trim(),
    line: css.getPropertyValue("--line").trim()
  };
}

export function drawLineChart(canvas, labels, series, height = 270){
  if(!canvas) return;
  const {context: ctx, width} = setupCanvas(canvas, height);
  const {text, muted, line} = themeColors();
  const padding = {left: 56, right: 18, top: 30, bottom: 42};
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...series.flatMap(item => item.data)) * 1.15;

  ctx.font = "12px system-ui";
  ctx.strokeStyle = line;
  ctx.fillStyle = muted;
  ctx.lineWidth = 1;

  for(let index = 0; index <= 4; index++){
    const y = padding.top + chartHeight - (chartHeight * index / 4);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(`$${Math.round(maxValue * index / 4)}`, 4, y + 4);
  }

  labels.forEach((label, index) => {
    const step = Math.max(1, Math.ceil(labels.length / 12));
    if(index % step !== 0) return;
    const x = padding.left + chartWidth * index / Math.max(labels.length - 1, 1);
    ctx.fillText(label, x - 10, height - 14);
  });

  series.forEach(item => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    item.data.forEach((value, index) => {
      const x = padding.left + chartWidth * index / Math.max(labels.length - 1, 1);
      const y = padding.top + chartHeight - value / maxValue * chartHeight;
      if(index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();

    item.data.forEach((value, index) => {
      const x = padding.left + chartWidth * index / Math.max(labels.length - 1, 1);
      const y = padding.top + chartHeight - value / maxValue * chartHeight;
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  let legendX = padding.left;
  series.forEach(item => {
    ctx.fillStyle = item.color;
    ctx.fillRect(legendX, padding.top - 18, 14, 5);
    ctx.fillStyle = text;
    ctx.fillText(item.label, legendX + 20, padding.top - 11);
    legendX += 130;
  });
}

export function drawDonutChart(canvas, labels, values){
  if(!canvas) return;
  const {context: ctx, width} = setupCanvas(canvas, 300);
  const {text, muted} = themeColors();
  const colors = ["#00a6a6", "#5b2c6f", "#f59e0b", "#64748b"];
  const total = Math.max(1, values.reduce((sum, value) => sum + value, 0));
  const centerX = width / 2;
  const centerY = 112;
  const outerRadius = 80;
  const innerRadius = 48;
  let angle = -Math.PI / 2;

  values.forEach((value, index) => {
    const nextAngle = angle + value / total * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, angle, nextAngle);
    ctx.arc(centerX, centerY, innerRadius, nextAngle, angle, true);
    ctx.closePath();
    ctx.fillStyle = colors[index];
    ctx.fill();
    angle = nextAngle;
  });

  const money = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format(total);
  ctx.textAlign = "center";
  ctx.fillStyle = text;
  ctx.font = "700 18px system-ui";
  ctx.fillText(money, centerX, centerY + 4);
  ctx.fillStyle = muted;
  ctx.font = "12px system-ui";
  ctx.fillText("Year total", centerX, centerY + 24);
  ctx.textAlign = "left";

  labels.forEach((label, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 18 + column * width / 2;
    const y = 226 + row * 34;
    ctx.fillStyle = colors[index];
    ctx.fillRect(x, y - 10, 12, 12);
    ctx.fillStyle = text;
    ctx.fillText(label, x + 18, y);
    ctx.fillStyle = muted;
    const valueText = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format(values[index]);
    ctx.fillText(valueText, x + 18, y + 16);
  });
}

export function drawPercentBars(canvas, labels, series){
  if(!canvas) return;
  const {context: ctx, width, height} = setupCanvas(canvas, 300);
  const {text, muted, line} = themeColors();
  const padding = {left: 50, right: 18, top: 30, bottom: 44};
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...series.flatMap(item => item.data)) * 1.2;

  ctx.font = "12px system-ui";
  ctx.strokeStyle = line;
  ctx.fillStyle = muted;

  for(let index = 0; index <= 4; index++){
    const y = padding.top + chartHeight - chartHeight * index / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(`${(maxValue * index / 4).toFixed(0)}%`, 5, y + 4);
  }

  const groupWidth = chartWidth / Math.max(labels.length, 1);
  const barWidth = Math.max(4, Math.min(12, groupWidth / (series.length + 1)));

  labels.forEach((label, index) => {
    const step = Math.max(1, Math.ceil(labels.length / 10));
    if(index % step === 0){
      ctx.fillText(label, padding.left + groupWidth * index, height - 14);
    }
  });

  series.forEach((item, seriesIndex) => {
    ctx.fillStyle = item.color;
    item.data.forEach((value, index) => {
      const x = padding.left + index * groupWidth + seriesIndex * barWidth + groupWidth * .15;
      const y = padding.top + chartHeight - value / maxValue * chartHeight;
      ctx.fillRect(x, y, barWidth, padding.top + chartHeight - y);
    });
  });

  let legendX = padding.left;
  series.forEach(item => {
    ctx.fillStyle = item.color;
    ctx.fillRect(legendX, padding.top - 18, 14, 8);
    ctx.fillStyle = text;
    ctx.fillText(item.label, legendX + 20, padding.top - 10);
    legendX += 140;
  });
}
