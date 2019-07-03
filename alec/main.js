const VERT = `
attribute float scale;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_PointSize = scale * ( 500.0 / - mvPosition.z );
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAG = `
uniform vec3 color;
void main() {
  if ( length( gl_PointCoord - vec2( 0.5, 0.5 ) ) > 0.475 ) discard;
  gl_FragColor = vec4( color, 1.0 );
}
`;

if (WEBGL.isWebGLAvailable() === false) {
  document.body.appendChild(WEBGL.getWebGLErrorMessage());
}

var SEPARATION = 100,
  AMOUNTX = 50,
  AMOUNTY = 50;
var intcpt = 2500;

var selectionArray = [
  "31,2",
  "35,10",
  "41,5",
  "45,14",
  "28,6",
  "36,1",
  "34,14",
  "32,12",
  "44,18",
  "48,12",
  "45,5",
  "40,7",
];
var selectionTree = d3
  .stratify()
  .parentId(d => d[0])
  .id(d => d[1])([
  ["", "root"],
  ["root", "31,2"],
  ["root", "35,10"],
  ["root", "41,5"],
  ["root", "45,14"],
  ["31,2", "28,6"],
  ["31,2", "36,1"],
  ["35,10", "34,14"],
  ["35,10", "32,12"],
  ["45,14", "44,18"],
  ["45,14", "48,12"],
  ["41,5", "45,5"],
  ["41,5", "40,7"],
]);
var selection = new Set(selectionArray);

var container, stats;
var camera, scene, renderer, raycaster, controls;
var material, material2;

var particles,
  lines = {},
  count = 0;

var mouse = new THREE.Vector2(),
  INTERSECTED;

var windowHalfX = window.innerWidth / 2;
var windowHalfY = window.innerHeight / 2;

var tree = data =>
  d3
    .tree()
    .size([Math.PI, window.innerHeight / 3])
    .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth)(
    d3.hierarchy(data)
  );
var radialTree = new Map();

init();
animate();
// var view = 0; //
var view = 2; //
var transitionStart = -5;
var keyPoints = [];

function getIthPoint(i, n, r) {
  const theta = (i / n) * 2 * Math.PI;
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

function init() {
  container = document.createElement("div");
  document.body.appendChild(container);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    // 1000,
    1,
    10000
  );
  camera.position.x = 2500;
  camera.position.y = 500;
  // camera.position.x = 0;
  // camera.position.y = 0;
  camera.position.z = -2500;

  scene = new THREE.Scene();

  var axesHelper = new THREE.AxesHelper(2500);
  scene.add(axesHelper);

  //

  var numParticles = AMOUNTX * AMOUNTY;

  var positions = new Float32Array(numParticles * 3);
  var scales = new Float32Array(numParticles);

  var i = 0,
    j = 0;

  for (var ix = 0; ix < AMOUNTX; ix++) {
    for (var iy = 0; iy < AMOUNTY; iy++) {
      positions[i] = xpos(ix); // x
      positions[i + 1] = 100; // y
      positions[i + 2] = zpos(iy); // z

      scales[j] = 32;

      i += 3;
      j++;
    }
  }

  var geometry = new THREE.BufferGeometry();
  geometry.addAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.addAttribute("scale", new THREE.BufferAttribute(scales, 1));

  material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });

  // red material
  material2 = material.clone();
  material2.uniforms = {
    color: { value: new THREE.Color(0xff0000) },
  };

  particles = new THREE.Points(geometry, material);
  scene.add(particles);

  var lineMaterial = new THREE.LineBasicMaterial({
    color: 0x0000ff,
  });

  lines["root"] = new THREE.Geometry();
  lines["root"].setFromPoints(
    selectionTree.children.map(({ id }) => {
      const i = +id.split(",")[0] * AMOUNTX + +id.split(",")[1];
      return new THREE.Vector3(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      );
    })
  );
  var line = new THREE.Line(lines["root"], lineMaterial);
  scene.add(line);

  selectionTree.leaves().forEach(({ data }) => {
    const i0 = +data[0].split(",")[0] * AMOUNTX + +data[0].split(",")[1];
    const i1 = +data[1].split(",")[0] * AMOUNTX + +data[1].split(",")[1];
    const key = data.join("-");
    lines[key] = new THREE.Geometry();
    lines[key].setFromPoints([
      new THREE.Vector3(
        positions[i0 * 3],
        positions[i0 * 3 + 1],
        positions[i0 * 3 + 2]
      ),
      new THREE.Vector3(
        positions[i1 * 3],
        positions[i1 * 3 + 1],
        positions[i1 * 3 + 2]
      ),
    ]);

    var line = new THREE.Line(lines[key], lineMaterial);
    scene.add(line);
  });

  //
  raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 20;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  var geometry = new THREE.PlaneGeometry(500, 500);
  var material = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    side: THREE.DoubleSide,
  });
  var plane = new THREE.Mesh(geometry, material);
  scene.add(plane);
  plane.position.x = 500;
  plane.position.z = -500;
  console.log("plane", plane);

  stats = new Stats();
  // container.appendChild(stats.dom);

  // const testData = [
  //   { id: "31,2", x: 0 + 5, y: 0 + 5 },
  //   { id: "35,10", x: window.innerWidth - 5, y: 0 + 5 },
  //   { id: "41,5", x: 0 + 5, y: window.innerHeight - 5 },
  //   { id: "45,14", x: window.innerWidth - 5, y: window.innerHeight - 5 },
  // ];
  camera.updateProjectionMatrix();
  camera.lookAt(scene);
  tree(selectionTree)
    .descendants()
    .reverse()
    // testData
    .forEach(d => {
      const theta = d.x;
      const x = windowHalfX + Math.cos(theta - Math.PI / 2) * d.y;
      const y = windowHalfY + Math.sin(theta - Math.PI / 2) * d.y;
      const normX = (x / window.innerWidth) * 2 - 1;
      const normY = -(y / window.innerHeight) * 2 + 1;
      console.log("cords", d.x, d.y, x, y);
      console.log("normX, normY", normX, normY);

      const pos = new THREE.Vector2(normX, normY);
      console.log("pos", JSON.stringify(pos));
      raycaster.setFromCamera(pos, camera);

      // direction vector from perspective of camera as origin
      const dir = raycaster.ray.direction.normalize();
      console.log("dir", JSON.stringify(dir));

      const worldVector = raycaster.ray.at(1000, new THREE.Vector3());
      // const worldVector = camera.position
      //   .clone()
      //   .add(dir.clone().multiply(camera.position.clone()));

      // const screenVector = new THREE.Vector3(normX, normY, -1);
      // console.log("screenVector", screenVector);
      // screenVector.unproject(camera); // returns normalized values!

      // const aspectRatio =
      //   renderer.context.canvas.width / renderer.context.canvas.height;

      // const worldVector = new THREE.Vector3(
      //   screenVector.x / aspectRatio,
      //   screenVector.y,
      //   screenVector.z //* camera.position.z
      // );
      console.log("worldVector", worldVector);

      radialTree.set(d.data.id, worldVector);
    });
  const node = d3
    .select("svg.tree")
    .attr("height", window.innerHeight)
    .attr("width", window.innerWidth)
    .append("g")
    .selectAll("g")
    .data(
      // testData
      tree(selectionTree)
        .descendants()
        .reverse()
    )
    .join("g")
    .attr("transform", d => {
      const theta = d.x;
      const x = Math.cos(theta - Math.PI / 2) * d.y;
      const y = Math.sin(theta - Math.PI / 2) * d.y;
      return `translate(${windowHalfX + x},${windowHalfY + y})`;
      // return `translate(${d.x},${d.y})`;
    });
  node
    .append("circle")
    .attr("r", 5)
    .attr("fill", "white");

  document.addEventListener("mousemove", onDocumentMouseMove, false);

  //

  window.addEventListener("resize", onWindowResize, false);
  window.addEventListener("keydown", onKeyPress, false);
  window.addEventListener(
    "click",
    () => {
      if (view === 2 && INTERSECTED) console.log(INTERSECTED);
    },
    false
  );
}

function onKeyPress(e) {
  if (e.keyCode === 32) {
    transitionStart = count;
    view = (view + 1) % 3;
    if (view === 2) {
      setTimeout(() => drawHTMLEls(), 5000);
    } else if (document.querySelector(".ui-nodes").children.length) {
      destroyHTML();
    }
  }
}

function destroyHTML() {
  document.querySelectorAll(".ui-nodes div").forEach(e => {
    document.querySelector(".ui-nodes").removeChild(e);
  });
}

function drawHTMLEls() {
  if (document.querySelector(".ui-nodes").children.length) {
    destroyHTML();
  }
  const { canvas } = renderer.context;
  const positions = particles.geometry.attributes.position.array;
  camera.updateProjectionMatrix();

  selectionArray.forEach(e => {
    const i = +e.split(",")[0] * AMOUNTX + +e.split(",")[1];

    const screen = new THREE.Vector3(
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2]
    ).project(camera);

    const x = Math.round(
      (0.5 + screen.x / 2) * (canvas.width / window.devicePixelRatio)
    );
    const y = Math.round(
      (0.5 - screen.y / 2) * (canvas.height / window.devicePixelRatio)
    );

    const child = document
      .querySelector(".ui-nodes")
      .appendChild(document.createElement("div"));
    child.style.left = x - 14 + "px";
    child.style.top = y - 14 + "px";
  });
  // selection.has(Math.floor(index / AMOUNTX) + "," + (index % AMOUNTY))
}

//https://stackoverflow.com/questions/27409074/converting-3d-position-to-2d-screen-position-r69

function interpolate(a, b, i) {
  return a + (b - a) * i;
}

function onWindowResize() {
  windowHalfX = window.innerWidth / 2;
  windowHalfY = window.innerHeight / 2;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);

  drawHTMLEls();
}

function onDocumentMouseMove(event) {
  event.preventDefault();
  mouse.set(
    (event.layerX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
}

function xpos(x) {
  return x * SEPARATION - (AMOUNTX * SEPARATION) / 2;
}

function zpos(y) {
  return y * SEPARATION - (AMOUNTY * SEPARATION) / 2;
}

function ypos(x, y, c) {
  return 100;
  // return Math.sin((x + c) * 0.3) * 50 + Math.sin((y + c) * 0.5) * 50;
}
//

function animate() {
  requestAnimationFrame(animate);

  render();
  stats.update();
  controls.update();
}

function render() {
  // camera.position.x += (mouse.x - camera.position.x) * 0.05;
  // camera.position.y += (-mouse.y - camera.position.y) * 0.05;
  camera.lookAt(scene.position);
  var positions = particles.geometry.attributes.position.array;
  var scales = particles.geometry.attributes.scale.array;

  var i = 0,
    j = 0;
  const t = Math.min(1, Math.max(0, (count - transitionStart) / 10));

  for (var ix = 0; ix < AMOUNTX; ix++) {
    for (var iy = 0; iy < AMOUNTY; iy++) {
      const slug = ix + "," + iy;
      const inGroup = selection.has(slug);
      const x = xpos(ix);
      const y = ypos(ix, iy, count);
      const z = zpos(iy);

      let v2x, v2y, v2z;
      if (inGroup) {
        const worldVector = radialTree.get(slug);
        v2x = worldVector.x;
        v2y = worldVector.y;
        v2z = worldVector.z;
        // const selectionIndex = selectionArray.indexOf(slug);
        // [v2x, v2y] = getIthPoint(selectionIndex, selectionArray.length, 1000);
        // v2x *= 0.72;
        // v2x += intcpt / 2;
        // v2y += 200;
      }

      // VIEW 0
      if (view === 0) {
        positions[i] = inGroup ? interpolate(v2x, x, t) : x;
        positions[i + 1] = inGroup ? interpolate(v2y, y, t) : y;
        positions[i + 2] = inGroup ? interpolate(v2z, z, t) : z;

        scales[j] = 32;
        // scales[j] =
        //   (Math.sin((ix + count) * 0.3) + 1) * 8 +
        //   (Math.sin((iy + count) * 0.5) + 1) * 8;

        // VIEW 1
      } else if (view === 1) {
        positions[i] = x;
        positions[i + 1] = inGroup
          ? interpolate(ypos(ix, iy, transitionStart), 400, t)
          : y;
        positions[i + 2] = z;

        scales[j] = inGroup
          ? interpolate(16, 40, t)
          : (Math.sin((ix + count) * 0.3) + 1) * 8 +
            (Math.sin((iy + count) * 0.5) + 1) * 8;

        // VIEW 2
      } else if (view === 2) {
        positions[i] = inGroup ? interpolate(x, v2x, t) : x;
        positions[i + 1] = inGroup ? interpolate(400, v2y, t) : y;
        positions[i + 2] = inGroup ? interpolate(z, v2z, t) : z;

        scales[j] = inGroup ? interpolate(40, 40, t) : interpolate(16, 8, t);
      }

      i += 3;
      j++;
    }
  }

  lines["root"].setFromPoints(
    selectionTree.children.map(({ id }) => {
      const i = +id.split(",")[0] * AMOUNTX + +id.split(",")[1];
      return new THREE.Vector3(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      );
    })
  );
  lines["root"].verticesNeedUpdate = true;
  selectionTree.leaves().forEach(({ data }) => {
    const i0 = +data[0].split(",")[0] * AMOUNTX + +data[0].split(",")[1];
    const i1 = +data[1].split(",")[0] * AMOUNTX + +data[1].split(",")[1];
    const key = data.join("-");
    lines[key].setFromPoints([
      new THREE.Vector3(
        positions[i0 * 3],
        positions[i0 * 3 + 1],
        positions[i0 * 3 + 2]
      ),
      new THREE.Vector3(
        positions[i1 * 3],
        positions[i1 * 3 + 1],
        positions[i1 * 3 + 2]
      ),
    ]);
    lines[key].verticesNeedUpdate = true;
  });

  // raycaster.setFromCamera(mouse, camera);
  // console.log("raycaster", raycaster);
  // raycaster.params.Points.threshold = view === 2 ? 40 : 20;
  // particles.geometry.boundingBox = null;
  // const intersects = raycaster.intersectObject(particles);
  // if (intersects.length > 0) {
  //   if (view === 2) {
  //     const selectedIntersects = intersects.filter(({ index }) =>
  //       selection.has(Math.floor(index / AMOUNTX) + "," + (index % AMOUNTY))
  //     );
  //     INTERSECTED = selectedIntersects.length
  //       ? selectedIntersects[0].index
  //       : null;
  //     scales[INTERSECTED] = 250;
  //   } else {
  //     INTERSECTED = intersects[0].index;
  //     scales[INTERSECTED] = 64;
  //   }
  // } else if (INTERSECTED !== null) {
  //   INTERSECTED = null;
  // }

  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.scale.needsUpdate = true;

  renderer.render(scene, camera);

  count += 0.1;
}
