const canvas = document.getElementById("canvas"),
  context = canvas.getContext("2d"),
  width = (canvas.width = window.innerWidth),
  height = (canvas.height = window.innerHeight),
  opacityAlpha = 0.0075,
  numPoints = 800,
  center = [width / 2, height / 2],
  friction = 0.99,
  speed = 0.025;

context.lineWidth = 0.1;
let start;
let z = 0;
let res = 10;

let state = {
  numPoints,
  speed,
  showFlow: false,
};

// change the app state and trigger an update
function setState(nextState) {
  const prevState = state;
  state = Object.assign({}, state, nextState);
  update(prevState);
  console.log("state update", state);
}

// create points
let points = [];

// run on load (mount)
setState(state);

// const controls = ["show flow fields"];
const controls = {
  numPoints: {
    type: "input",
    display: "number of lines",
  },
  showFlow: {
    type: "checkbox",
    display: "show flow fields",
  },
};

d3.select("div#controls")
  .selectAll(".control")
  .data(Object.entries(controls))
  .enter()
  .append("div")
  .attr("class", "control")
  .append("div")
  .attr("class", d => `${d[1].type}`)
  .classed("checked", d => d[0] === state[d[0]])
  .text(d => d[1].display)
  .on("click", d => setState({ [d[0]]: !state[d[0]] }));

function refreshPoints() {
  // create points.
  points = [];
  for (let y = 0; y < numPoints; y += 1) {
    points.push({
      x: 0,
      y: 0,
      vx: Math.random(),
      vy: Math.random(),
    });
  }

  noise.seed(Math.random());
}

function update(prevState) {
  cancelAnimationFrame(render);
  context.clearRect(0, 0, width, height);
  refreshPoints();

  // render();
  canvas.addEventListener("click", () => {
    cancelAnimationFrame(render);
    context.clearRect(0, 0, width, height);
    refreshPoints();
    start = Date.now();
    render();
  });

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
  }
  state.showFlow ? drawFlowField() : null;

  function render() {
    drawLines();

    // remove past lines
    // context.fillStyle = `rgba(255, 255, 255, ${opacityAlpha})`;
    // context.fillRect(0, 0, canvas.width, canvas.height);

    z += 0.01;
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

  function getValue(x, y) {
    var scale = 0.003;
    // if (outsideBorder(x, y))
    // return Math.atan2(y - center[1], x - center[0]) + (9 * Math.PI) / 10;
    // return noise.perlin2(x * scale, y * scale) * Math.PI * 2;

    // if (leftSide(x, y)) {
    //   return Math.PI * 2;
    // }

    // let results = inCircles(x, y);
    // return results
    //   ? Math.atan2(y - results[1], x - results[0]) + (3 * Math.PI) / 3
    //   : // : noise.perlin3(x * scale, y * scale, z) * Math.PI * 2;
    //     noise.perlin2(x * scale, y * scale) * Math.PI;
    // // Math.atan2(y - midHeight, x - (width - SideBorderRadius)) *
    // // noise.perlin2(x * scale, y * scale);

    return noise.perlin2(x * scale, y * scale) * Math.PI * 2;
    // return noise.perlin3(x * scale, y * scale, z) * Math.PI * 2;

    // original getValue funtion for both inCircle and outsideBorder
    // if (inCircles(x, y))
    //   return Math.atan2(y - center[1], x - center[0]) + (1 * Math.PI) / 10;
    // return noise.perlin2(x * scale, y * scale, z) * Math.PI * 2;
  }
}
