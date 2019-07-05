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

/**
 * DATA & TREE STRUCTURE
 */

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

var tree = data =>
  d3
    .tree()
    .size([Math.PI, window.innerHeight / 3])
    .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth)(
    d3.hierarchy(data)
  );
var radialTree = new Map();

/**
 * INITIALIZATIONS
 */

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

var view = 0; //
var transitionStart = -5;
var keyPoints = [];

/**
 * CALL MAIN FUNCTIONS
 */

init();
animate();

function getIthPoint(i, n, r) {
  const theta = (i / n) * 2 * Math.PI;
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

function init() {
  container = document.createElement("div");
  document.body.appendChild(container);

  /**
   * CAMERA
   */
  camera = new THREE.PerspectiveCamera(
    75, // field of view
    window.innerWidth / window.innerHeight, // aspect ratio
    1, // near field
    10000 // far field
  );
  camera.position.x = 3000;
  camera.position.y = 500;
  camera.position.z = -3000;

  /**
   *  SCENE
   */
  scene = new THREE.Scene();

  var numParticles = AMOUNTX * AMOUNTY;
  var positions = new Float32Array(numParticles * 3); // 3 positions for each vertex (x, y, z)
  var scales = new Float32Array(numParticles); // 1 for each, scale number

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

  /**
   * POINT GEOMETRY
   */
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

  /**
   * LINE GEOMETRY
   */
  var lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(0xffffff),
  });

  // function calcRootBezier(){
  var curve = new THREE.CatmullRomCurve3(
    selectionTree.children.map(({ id }) => {
      const i = +id.split(",")[0] * AMOUNTX + +id.split(",")[1];
      return new THREE.Vector3(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      );
    })
  );

  var curvePoints = curve.getPoints(50);
  lines["root"] = new THREE.BufferGeometry().setFromPoints(curvePoints);

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

  // raycaster
  raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 20;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // constrols --
  /**
   * note: controls needed for our 2D -> 3D to work, unclear why
   * */
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.update();

  // // stats
  // stats = new Stats();
  // container.appendChild(stats.dom);

  // // axes helper
  // var axesHelper = new THREE.AxesHelper(2500);
  // scene.add(axesHelper);

  /**
   * CALC FINAL RADIAL TREE POSITIONS
   */
  tree(selectionTree)
    .descendants()
    .reverse()
    .forEach(d => {
      const theta = d.x;
      const x = windowHalfX + Math.cos(theta - Math.PI / 2) * d.y;
      const y = windowHalfY + Math.sin(theta - Math.PI / 2) * d.y;

      // get coordinates to range [-1,1]
      const normX = (x / window.innerWidth) * 2 - 1;
      const normY = -(y / window.innerHeight) * 2 + 1;

      const pos = new THREE.Vector2(normX, normY);
      // projects a ray out from the camera origin to pos
      raycaster.setFromCamera(pos, camera);

      // get position of ray in direction of pos scalled by t (1000)
      const worldVector = raycaster.ray.at(1000, new THREE.Vector3());

      radialTree.set(d.data.id, worldVector);
    });

  document.addEventListener("mousemove", onDocumentMouseMove, false);
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
    // space bar
    transitionStart = count;
    view = (view + 1) % 3;
    if (view === 2) {
      // setTimeout(() => drawHTMLEls(), 5000);
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

// TODO - update to pull from radial tree positioning
function drawHTMLEls() {
  if (document.querySelector(".ui-nodes").children.length) {
    destroyHTML();
  }
  const { canvas } = renderer.context;
  const positions = particles.geometry.attributes.position.array;

  selectionArray.forEach(e => {
    const i = +e.split(",")[0] * AMOUNTX + +e.split(",")[1];

    // returns NDCs from [-1,1]
    const screen = new THREE.Vector3(
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2]
    ).project(camera);

    // normalizes values for screen dimensions
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

  // drawHTMLEls();
}

function onDocumentMouseMove(event) {
  event.preventDefault(); // comment to out get orbit control mouse events to work
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
  // return 100;
  return Math.sin((x + c) * 0.3) * 50 + Math.sin((y + c) * 0.5) * 50;
}
//

function animate() {
  requestAnimationFrame(animate);

  render();
  controls.update();
  // stats.update();
}

function render() {
  var positions = particles.geometry.attributes.position.array;
  var scales = particles.geometry.attributes.scale.array;

  var i = 0,
    j = 0;

  // t = percent of transition done
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
      // transitions between radial position and starting position
      if (view === 0) {
        positions[i] = inGroup ? interpolate(v2x, x, t) : x;
        positions[i + 1] = inGroup ? interpolate(v2y, y, t) : y;
        positions[i + 2] = inGroup ? interpolate(v2z, z, t) : z;

        scales[j] = 32;
        scales[j] =
          (Math.sin((ix + count) * 0.3) + 1) * 8 +
          (Math.sin((iy + count) * 0.5) + 1) * 8;

        // VIEW 1
        // raise points up out of the field
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
        // forms radial view
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

  var curve = new THREE.CatmullRomCurve3(
    selectionTree.children.map(({ id }) => {
      const i = +id.split(",")[0] * AMOUNTX + +id.split(",")[1];
      return new THREE.Vector3(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      );
    })
  );

  var curvePoints = curve.getPoints(50);
  lines["root"].setFromPoints(curvePoints);

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

  raycaster.setFromCamera(mouse, camera);
  raycaster.params.Points.threshold = view === 2 ? 40 : 20;
  particles.geometry.boundingBox = null;
  const intersects = raycaster.intersectObject(particles);
  if (intersects.length > 0) {
    if (view === 2) {
      const selectedIntersects = intersects.filter(({ index }) =>
        selection.has(Math.floor(index / AMOUNTX) + "," + (index % AMOUNTY))
      );
      INTERSECTED = selectedIntersects.length
        ? selectedIntersects[0].index
        : null;
      scales[INTERSECTED] = 250; // make dot bigger on mouse hover
    } else {
      INTERSECTED = intersects[0].index;
      scales[INTERSECTED] = 64;
    }
  } else if (INTERSECTED !== null) {
    INTERSECTED = null;
  }

  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.scale.needsUpdate = true;

  renderer.render(scene, camera);

  count += 0.1;
}
