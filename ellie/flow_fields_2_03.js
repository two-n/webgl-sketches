const canvas = document.getElementById("canvas"),
  context = canvas.getContext("2d"),
  topMargin = window.innerHeight / 8,
  width = (canvas.width = window.innerWidth),
  height = (canvas.height = window.innerHeight - topMargin),
  opacityAlpha = 0.0075,
  numPoints = 800,
  circleRadius = 20,
  numCircles = 4,
  TopBorderRadius = topMargin,
  SideBorderRadius = width / 10,
  bufferRadius = 30,
  center = [width / 2, height / 2],
  friction = 0.99,
  speed = 0.025;

context.translate(0, topMargin);
context.lineWidth = 0.1;
let start;
let z = 0;
let res = 10;

const midHeight = height / 2;
const scale = d3
  .scaleLinear()
  .domain([0, numCircles])
  .range([SideBorderRadius, width - SideBorderRadius]);
let circles = [];
for (let i = 0; i < numCircles; i++) {
  circles[i] = [scale(i + 1), midHeight];
}

// create points.
let points = [];
// for (let y = 0; y < numPoints; y += 1) {
//   points.push({
//     x: SideBorderRadius,
//     y: height / 2,
//     vx: Math.random(),
//     vy: Math.random(),
//   });
// }

// noise.seed(Math.random());
// drawFlowField();
// // drawCircles();
// drawText("(enter)", SideBorderRadius);
// drawText("DISCOVER", circles[0][0]);
// drawText("PLAN", circles[1][0]);
// drawText("LIVE", circles[2][0]);
// drawText("RELIVE", circles[3][0]);

function mount() {
  // create points.
  points = [];
  for (let y = 0; y < numPoints; y += 1) {
    points.push({
      x: SideBorderRadius,
      y: height / 2,
      vx: Math.random(),
      vy: Math.random(),
    });
  }

  noise.seed(Math.random());
  // drawFlowField();
  // drawCircles();
  // drawText("(enter)", SideBorderRadius);
  // drawText("DISCOVER", circles[0][0]);
  // drawText("PLAN", circles[1][0]);
  // drawText("LIVE", circles[2][0]);
  // drawText("RELIVE", circles[3][0]);
}

mount();

// render();
canvas.addEventListener("click", () => {
  cancelAnimationFrame(render);
  context.clearRect(0, 0, width, height);
  start = Date.now();
  mount();
  render();
});

function drawCircles() {
  for (let i = 0; i < circles.length; i++) {
    context.beginPath();
    context.arc(circles[i][0], circles[i][1], circleRadius, 0, 2 * Math.PI);
    context.stroke();
  }
}

function drawText(text, xPos) {
  context.font = "30px Gilroy";
  context.textAlign = "center";
  context.textBaseline = "middle";
  let padding = 5;
  // let textWidth = context.measureText(text).width + padding * 2;
  // let textHeight = 40;
  // context.fillStyle = "red";
  // context.fillRect(
  //   xPos - textWidth + padding,
  //   midHeight - textHeight / 2,
  //   textWidth,
  //   textHeight
  // );
  context.stroke();
  context.fillStyle = "red";
  context.fillText(text, xPos, midHeight);
}

const labels = ["(start)", "DISCOVER", "PLAN", "LIVE", "RELIVE"];
const labelPositions = [[SideBorderRadius, midHeight], ...circles];

d3.select("div#text")
  .selectAll(".phaseLabel")
  .data(labels)
  .enter()
  .append("div")
  .attr(
    "style",
    (_, i) => `
    width: ${width / labels.length}px;
      transform: translate(${labelPositions[i][0]}px, ${midHeight +
      topMargin -
      15}px)`
  )
  .append("span")
  .attr("class", "label")
  .text(d => d);

function drawFlowField() {
  for (var x = 0; x < width; x += res) {
    for (var y = 0; y < height; y += res) {
      var value = getValue(x, y);
      context.save();
      context.translate(x, y);
      context.rotate(value);
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(res, 0);
      context.stroke();
      context.restore();
    }
  }
}

function drawLines() {
  for (let i = 0; i < points.length; i++) {
    // get each point and do what we did before with a single point
    const p = points[i];

    let value = getValue(p.x, p.y);
    p.vx += Math.cos(value) * speed;
    p.vy += Math.sin(value) * speed;

    // move to current position
    context.beginPath();
    context.moveTo(p.x, p.y);

    // add velocity to position and line to new position
    p.x += p.vx;
    p.y += p.vy;
    context.lineWidth = 0.15;
    context.lineTo(p.x, p.y);
    context.stroke();

    // apply some friction so point doesn't speed up too much
    p.vx *= friction;
    p.vy *= friction;

    // wrap around edges of screen
    if (p.x > width) p.x = 0;
    if (p.y > height) p.y = 0;
    if (p.x < 0) p.x = width;
    if (p.y < 0) p.y = height;
  }

  // console.log("max vx:", Math.max(...points.map(d => d.vx)));
  // console.log("max vy:", Math.max(...points.map(d => d.vy)));
}

function render() {
  drawLines();

  // remove past lines
  // context.fillStyle = `rgba(255, 255, 255, ${opacityAlpha})`;
  // context.fillRect(0, 0, canvas.width, canvas.height);

  // z += 0.01;
  // drawFlowField();
  // drawCircles();
  if (Date.now() - start < 30000) {
    // 30000 = 30 seconds
    requestAnimationFrame(render);
  } else {
    console.log("stopped");
    cancelAnimationFrame(render);
  }
}

function inCircles(x2, y2) {
  for (let i = 0; i < circles.length; i++) {
    let distance = Math.sqrt(
      Math.pow(circles[i][0] - x2, 2) + Math.pow(circles[i][1] - y2, 2)
    );
    if (distance < circleRadius + bufferRadius) return circles[i];
  }
  return false;
}

function outsideBorder(x, y) {
  return (
    y < TopBorderRadius || y > height - TopBorderRadius
    // x2 < SideBorderRadius ||
    // x2 > width - SideBorderRadius
  );
}

function leftSide(x, y) {
  return x < SideBorderRadius + bufferRadius;
}

function getValue(x, y) {
  var scale = 0.003;
  // if (outsideBorder(x, y))
  // return Math.atan2(y - center[1], x - center[0]) + (9 * Math.PI) / 10;
  // return noise.perlin2(x * scale, y * scale) * Math.PI * 2;

  if (leftSide(x, y)) {
    return Math.PI * 2;
  }

  let results = inCircles(x, y);
  return results
    ? Math.atan2(y - results[1], x - results[0]) + (3 * Math.PI) / 3
    : // : noise.perlin3(x * scale, y * scale, z) * Math.PI * 2;
      noise.perlin2(x * scale, y * scale) * Math.PI;
  // Math.atan2(y - midHeight, x - (width - SideBorderRadius)) *
  // noise.perlin2(x * scale, y * scale);

  // return noise.perlin2(x * scale, y * scale) * Math.PI * 2;
  // return noise.perlin3(x * scale, y * scale, z) * Math.PI * 2;

  // original getValue funtion for both inCircle and outsideBorder
  // if (inCircles(x, y))
  //   return Math.atan2(y - center[1], x - center[0]) + (1 * Math.PI) / 10;
  // return noise.perlin2(x * scale, y * scale, z) * Math.PI * 2;
}
