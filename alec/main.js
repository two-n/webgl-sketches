const FIELD_VERT = `
attribute float scale;
attribute float customScale;
attribute vec2 indices;

uniform float count;
uniform float percElevated; // percentage elevated

// FUNCTION: interpolation for floats
float interpolate(float start, float end, float perc) {
	return (start + (end - start) * perc);
}

// FUNCTION: dynamically scale field points
float scaleField(float scale, float ix, float iy, float count) {
	return (sin((ix + count) * 0.3) + 1.0) * 8.0 + (sin((iy + count) * 0.5) + 1.0) * 8.0;
}

void main() {
  // calculate undulating y
  float dynamic_y = sin((indices.x + count) * 0.3) * 50.0 + sin((indices.y + count) * 0.5) * 50.0;

  // field: use position.x, dynamic_y,  position.z
  vec3 pos = vec3(position.x, dynamic_y, position.z);

  float tween_scale = interpolate(scale, customScale, percElevated);
  float dynamic_scale = scaleField(tween_scale, indices.x, indices.y, count);

  vec4 mvPosition = modelViewMatrix * vec4( pos, 1.0 );
  gl_PointSize = tween_scale * ( 500.0 / - mvPosition.z );
  gl_Position = projectionMatrix * mvPosition;
}
`;

const NODES_VERT = `
attribute float scale;
attribute float customScale;
attribute vec2 indices;
attribute vec3 startingPosition;
attribute float nodeLevel;

uniform float count;
uniform float elevation;
uniform float percScaled; // used for scaling L1s
uniform float percElevated; // percentage elevated
uniform float percExpanded; // percentage expanded (for radial layout)
uniform float phase;
uniform float granularity;

// FUCNTION: interpolation for floats
float interpolate(float start, float end, float perc) {
	return (start + (end - start) * perc);
}

void main() {
  // calculate undulating y
  float dynamic_y = sin((indices.x + count) * 0.3) * 50.0 + sin((indices.y + count) * 0.5) * 50.0;

  // use startingPosition.x, tweenY, startingPosition.z
  vec3 pos = vec3(startingPosition.x, interpolate(dynamic_y, elevation, percElevated), startingPosition.z);

  // calculate intermediate position between field and elevated
  vec3 tweenPos =  pos + (position - pos) * percExpanded;

  // SCALING
  float tween_scale;
  if (nodeLevel == 1.0) {  // L1 Nodes
    if (phase > 0.0 && phase <= 1.0) {
      float perc = fract(phase) == 0.0 ? 1.0 : fract(phase);
      tween_scale = interpolate(0.1, scale, perc);
    }
    else if (phase > 0.0) {
      tween_scale = scale;
    }
  }
  else if (nodeLevel > 1.0 && phase > 3.0){  // L+ Nodes
    float perc = fract(phase) == 0.0 ? 1.0 : fract(phase);
    tween_scale = interpolate(0.1, scale, perc);
  }
  else {
    tween_scale = 0.0;
  }

  vec4 mvPosition = modelViewMatrix * vec4( tweenPos, 1.0 );
  gl_PointSize = tween_scale * ( 500.0 / - mvPosition.z );
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
var config = {
  scale_default: 25,
  scale_L1: 100,
  scale_L2: 25,
  scale_L3: 20,
  elevation: 700, // y offset
  camera_default: { x: 2500, y: 500, z: -2500 },
  camera_elevated: { x: 1500, y: 1000, z: -2750 },
  tree_diameter: 200, //500,
  line_segments: 200,
};

/**
 * DATA & TREE STRUCTURE
 */
var selectionArray = [
  "45,14",
  "41,5",
  "35,10",
  "31,2",
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
    .size([Math.PI, config.tree_diameter])
    .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth)(data);

var radialTree = new Map();

/**
 * INITIALIZATIONS
 */

var selection = new Set(selectionArray),
  fanJourney;
var container, stats;
var camera, scene, renderer, labelRenderer, raycaster, controls;
var fieldMaterial, nodesMaterial, lineMaterial;

var field,
  nodes,
  line,
  lines = {},
  count = 0;

var mouse = new THREE.Vector2(),
  INTERSECTED;

var windowHalfX = window.innerWidth / 2;
var windowHalfY = window.innerHeight / 2;

// var view = 0; //
var transitionStart = -5;
var keyPoints = [];

var state = {
  view: 0,
  selectedL1: null,
  granularity: 3,
  percElevated: 0,
  percExpanded: 0,
};

/**
 * PULL Fan Journey DATA
 */
d3.json("data.json")
  .then(data => {
    const stratefied = d3
      .stratify()
      .id(d => d["ref"])
      .parentId(d => d["Parent Node ID"])([
      { ["ref"]: "root", ["Parent Node ID"]: "" }, // append root node
      ...data["Fan Journey"]
        .filter(d => d["Node Name"] && d["Node Hierarchy"] < 4)
        .map((d, i) => ({ ...d, id: i })),
    ]);

    fanJourney = d3.hierarchy(stratefied);
  })
  .then(data => {
    console.log("fanJourney", fanJourney);
    init();
    animate();
  });

/**
 * INITIALIZATION
 */
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
  camera.position.x = config.camera_default.x;
  camera.position.y = config.camera_default.y;
  camera.position.z = config.camera_default.z;

  /**
   *  SCENE
   */
  scene = new THREE.Scene();

  /**
   * RAYCASTER
   */
  raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 20;

  /**
   * RENDERERS
   */
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  labelRenderer = new THREE.CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = 0;
  document.body.appendChild(labelRenderer.domElement);

  // STATS uncomment
  // stats = new Stats();
  // stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
  // document.body.appendChild(stats.dom);

  /**
   * CONTROLS
   * note: controls needed for our 2D -> 3D to work, unclear why
   * */
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.update();

  /**
   * POINT GEOMETRY
   */
  // material - used for both field and nodes
  // notes: https://stackoverflow.com/a/45472747
  fieldMaterial = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
      percElevated: { value: 0.0 }, // percent elevated, used in shader to TWEEN values
      count: { value: 0.0 }, // count that ticks up on each render
    },
    vertexShader: FIELD_VERT,
    fragmentShader: FRAG,
  });

  nodesMaterial = fieldMaterial.clone(); //.setValues({ vertexShader: NODES_VERT });
  nodesMaterial.setValues({
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
      percElevated: { value: 0.0 }, // percent elevated, used in shader to TWEEN values
      count: { value: 0.0 }, // count that ticks up on each render
      elevation: { value: config.elevation },
      percExpanded: { value: 0.0 }, // percent expanded, used in shader to TWEEN values
      phase: { value: state.view },
      granularity: { value: state.granularity },
    },
    vertexShader: NODES_VERT,
  });

  lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff }); //red: 0xff0000

  initField();
  initNodes();

  document.addEventListener("mousemove", onDocumentMouseMove, false);
  window.addEventListener("resize", onWindowResize, false);
  window.addEventListener("keydown", onKeyPress, false);
  window.addEventListener(
    "click",
    () => {
      if (state.view >= 2 && INTERSECTED) {
        console.log(INTERSECTED);
        zoomCameraTo(INTERSECTED);
      }
    },
    false
  );
}

function animate() {
  requestAnimationFrame(animate);

  render();
  controls.update();
  TWEEN.update();
  // stats.update();
}

function render() {
  // pass in count to shader - used for undulations
  count += 0.1;
  fieldMaterial.uniforms.count.value = count;
  nodesMaterial.uniforms.count.value = count;

  fieldMaterial.uniforms.percElevated.value = state.percElevated;
  nodesMaterial.uniforms.percElevated.value = state.percElevated;

  // draw lines for radial diagram using percExpanded uniform
  scene.children
    .filter(d => d.name === "nodeLine")
    .map(d => {
      d.geometry.setDrawRange(
        0,
        nodesMaterial.uniforms.percExpanded.value * config.line_segments
      );
    });

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(nodes);

  if (intersects.length > 0) {
    if (state.view >= 2) {
      INTERSECTED = intersects[0].point;
    }
  }

  field.geometry.attributes.scale.needsUpdate = true;

  fieldMaterial.uniforms.count.needsUpdate = true;
  nodesMaterial.uniforms.count.needsUpdate = true;
  fieldMaterial.uniforms.percElevated.needsUpdate = true;
  nodesMaterial.uniforms.percElevated.needsUpdate = true;
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

/**
 * HELPERS AND HANDLERS
 */

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

/**
 * creates node points geometry and line connecting them
 * pre-calculates all positions
 */
function initNodes() {
  var descendants = fanJourney.descendants().filter(d => d["ref"] != "root");
  var numNodes = descendants.length;

  var positions = new Float32Array(numNodes * 3), // 3 positions for each vertex (x, y, z)
    startingPosition = new Float32Array(numNodes * 3); // 3 positions for each vertex (x, y, z)

  var indices = new Float32Array(numNodes * 2); // 2 positions for each vertex (x, y, z)

  var scales = new Float32Array(numNodes), // 1 for each
    customScales = new Float32Array(numNodes); // 1 for each

  var nodeLevel = new Float32Array(numNodes); //.fill(1.0); // flag for nodes vs. field

  var lineVertices = [];

  var geometry = new THREE.BufferGeometry();
  nodes = new THREE.Points(geometry, nodesMaterial);

  // calculate positions
  fanJourney.children.map(d => {
    var id = d.data.data.id,
      pos_i = id * 3,
      ind_i = id * 2;
    // get pre-defined coords
    var [ix, iy] = selectionArray[id].split(",");
    // x and z are the same starting and final position, y is elevated in final
    positions[pos_i] = startingPosition[pos_i] = xpos(ix); // x
    startingPosition[pos_i + 1] = 100; // normal y
    positions[pos_i + 1] = config.elevation; // elevated y
    positions[pos_i + 2] = startingPosition[pos_i + 2] = zpos(iy); // z

    const l1Position = new THREE.Vector3(
      positions[pos_i],
      positions[pos_i + 1],
      positions[pos_i + 2]
    );

    // used for calculating sine movements
    indices[ind_i] = ix;
    indices[ind_i + 1] = iy;

    scales[id] = config.scale_L1; //config.scale_default;
    customScales[id] = config.scale_L1;
    nodeLevel[id] = 1.0;
    lineVertices.push(l1Position);

    function createLabel(d, l1Position, className = "label") {
      const labelDiv = document.createElement("div");
      labelDiv.className = className;
      labelDiv.textContent = d.data.data["Node Name"];
      // labelDiv.style.marginTop = "-1em";

      const label = new THREE.CSS2DObject(labelDiv);
      label.position.set(
        l1Position.x,
        l1Position.y + config.scale_L1 / 1.5,
        l1Position.z
      );
      label.name = className;
      return label;
    }
    const label = createLabel(d, l1Position);
    nodes.add(label);

    // calculate radial tree around L1 nodes
    tree(d)
      .descendants()
      .reverse()
      .forEach(e => {
        var p = e.data.data.id * 3;

        // if not L1 parent
        if (d.data.data.id != e.data.data.id) {
          const radialPosition = calcRadialPosition(e.x, e.y, l1Position);
          const parentRadialPosition =
            e.depth === 2 // check heirarchy level
              ? l1Position
              : calcRadialPosition(e.parent.x, e.parent.y, l1Position);

          startingPosition[p] = l1Position.x; // starting x
          positions[p] = radialPosition.x; // radial x

          startingPosition[p + 1] = l1Position.y; // starting y
          positions[p + 1] = radialPosition.y; // radial y

          startingPosition[p + 2] = l1Position.z; // starting z
          positions[p + 2] = radialPosition.z; // radial z

          scales[e.data.data.id] = config.scale_L2; //0.0;
          customScales[e.data.data.id] = config.scale_L2;
          nodeLevel[e.data.data.id] = e.depth;

          // calculate self vert and parent vert and create line, add to scene
          const nodeLine = createCurveLine(
            [parentRadialPosition, radialPosition],
            lineMaterial,
            "nodeLine"
          );
          scene.add(nodeLine);
        }
      });
  });

  //  geometry
  // positions
  geometry.addAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.addAttribute(
    "startingPosition",
    new THREE.BufferAttribute(startingPosition, 3)
  );
  // indices
  geometry.addAttribute("indices", new THREE.BufferAttribute(indices, 2));
  // scales
  geometry.addAttribute("scale", new THREE.BufferAttribute(scales, 1));
  geometry.addAttribute(
    "customScale",
    new THREE.BufferAttribute(customScales, 1)
  );
  geometry.addAttribute("nodeLevel", new THREE.BufferAttribute(nodeLevel, 1));

  nodes.name = "nodes";
  scene.add(nodes);

  line = createCurveLine(lineVertices, lineMaterial, "rootLine");
  scene.add(line);
}

function initField() {
  var numParticles = AMOUNTX * AMOUNTY;
  var positions = new Float32Array(numParticles * 3); // 3 positions for each vertex (x, y, z)
  var indices = new Float32Array(numParticles * 2); // 2 positions for each vertex (x, y, z)
  var scales = new Float32Array(numParticles).fill(config.scale_default); // 1 for each, scale number
  var customScales = new Float32Array(numParticles).fill(
    config.scale_default / 3
  ); // smaller scale when nodes are elevated
  var i = 0,
    k = 0,
    j = 0;

  // initial positions
  for (var ix = 0; ix < AMOUNTX; ix++) {
    for (var iy = 0; iy < AMOUNTY; iy++) {
      positions[i] = xpos(ix); // x
      positions[i + 1] = 100; // y
      positions[i + 2] = zpos(iy); // z

      indices[k] = ix;
      indices[k + 1] = iy;

      i += 3;
      k += 2;
      j++;
    }
  }

  //  geometry
  var geometry = new THREE.BufferGeometry();
  geometry.addAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.addAttribute("indices", new THREE.BufferAttribute(indices, 2));
  geometry.addAttribute("scale", new THREE.BufferAttribute(scales, 1));
  geometry.addAttribute(
    "customScale",
    new THREE.BufferAttribute(customScales, 1)
  );

  field = new THREE.Points(geometry, fieldMaterial);
  field.name = "field";
  scene.add(field);
}

function onKeyPress(e) {
  if (e.keyCode === 91) {
    console.log("case4");
    transition_expandRadial();
  }

  if (e.keyCode === 32) {
    // space bar
    transitionStart = count;
    state.view = (state.view + 1) % 5;
    console.log("view", state.view);
    switch (state.view) {
      case 0:
        console.log("case0");
        transition_default();
        break;
      case 1:
        console.log("case1");
        transition_scaleL1Dots();
        break;
      case 2:
        console.log("case2");
        transition_elevateNodes();
        break;
      case 3:
        console.log("case3");
        transition_drawLine();
        break;
      case 4:
        console.log("case4");
        transition_expandRadial();
        break;
    }
  }
}

function transition_default() {
  new TWEEN.Tween(camera.position)
    .to(config.camera_default, 1500)
    .delay(1000)
    .easing(TWEEN.Easing.Quadratic.In)
    .start();
}

function transition_scaleL1Dots() {
  // Tween scale of L1 dots from default -> scale_L1
  new TWEEN.Tween(nodesMaterial.uniforms.phase)
    .to({ value: state.view }, 1000) // going to 1
    .easing(TWEEN.Easing.Quadratic.Out)
    .start();
}

function transition_elevateNodes() {
  // Bring up nodes from field
  new TWEEN.Tween(state)
    .to({ percElevated: 1.0 }, 1000)
    .easing(TWEEN.Easing.Quadratic.Out)
    .start();
  new TWEEN.Tween(nodesMaterial.uniforms.phase)
    .to({ value: state.view }, 1000)
    .easing(TWEEN.Easing.Quadratic.Out)
    .start();

  d3.selectAll(".label").classed("visible", true);
}

function transition_drawLine() {
  // connect L1 dots together
  //https://stackoverflow.com/a/31411794 - tween setDrawRange
  new TWEEN.Tween(line.geometry.drawRange)
    .to({ count: config.line_segments }, 2000) // abstract this number
    .easing(TWEEN.Easing.Quadratic.In)
    .start();
}

function transition_expandRadial() {
  // tween uniform.percElevated to 1
  new TWEEN.Tween(nodesMaterial.uniforms.percExpanded)
    .to({ value: 1.0 }, 1000)
    .easing(TWEEN.Easing.Quadratic.Out)
    .start();
  new TWEEN.Tween(nodesMaterial.uniforms.phase)
    .to({ value: state.view }, 1000)
    .easing(TWEEN.Easing.Quadratic.Out)
    .start();

  // update camera angle
  new TWEEN.Tween(camera.position)
    .to(config.camera_elevated, 1500)
    .delay(1000)
    .easing(TWEEN.Easing.Quadratic.In)
    .start();

  new TWEEN.Tween(controls.target)
    .to(new THREE.Vector3(), 1500)
    .delay(1500)
    .easing(TWEEN.Easing.Quadratic.In)
    .start();
}

function zoomCameraTo(vec3) {
  // camera.lookAt(vec3);
  // TODO: figure out how to make this responsive to different sizes

  new TWEEN.Tween(camera.position)
    .to({ x: vec3.x, y: vec3.y + 100, z: vec3.z - 500 / camera.aspect }, 1500)
    .easing(TWEEN.Easing.Quadratic.In)
    .start();

  new TWEEN.Tween(controls.target)
    .to(vec3, 1500) // TODO adjust lookat vector to make it to the right of center
    .easing(TWEEN.Easing.Quadratic.Out)
    .start();
}

/**
 * View 2: title view, camera zooms in on selected node
 *  field: normal position, lightened scale
 *  nodes: elevated position, larger scale
 *  camera: zooms and rotates to frame selected node
 * note: this view should only be posible from view 1
 */
function transition_view2(node) {}

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
  const positions = field.geometry.attributes.position.array;

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

function interpolate(from, to, percentDone) {
  return from + (to - from) * percentDone;
}

function onWindowResize() {
  windowHalfX = window.innerWidth / 2;
  windowHalfY = window.innerHeight / 2;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  // drawHTMLEls();
}

function onDocumentMouseMove(event) {
  event.preventDefault();
  mouse.set(
    (event.layerX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
}

/**
 * Given X and Y in DOM screen space [0,width/height],
 *  returns [x, y, z] Vector3 of the intersection of a ray passing through
 *  those points on a plane determined by `at`.
 * @param {*} normX - in screen coordinates with range [0, innerWidth]
 * @param {*} normY - in screen coordinates with range  [0, innerHeight]
 * @param {*} at - the position z directrion from camera origin
 * this acts as a scalar to specify how close to the camera to render the points
 */
function get3Dfrom2d(screenX, screenY, at, camera, raycaster) {
  // Normalize coordinates from screen space to NDC space [-1,1]
  const normX = (screenX / window.innerWidth) * 2 - 1;
  const normY = -(screenY / window.innerHeight) * 2 + 1;

  const pos = new THREE.Vector2(normX, normY);

  // projects a ray out from the camera origin to pos
  raycaster.setFromCamera(pos, camera);

  // get position of ray in direction of pos scalled by t (1000)
  return raycaster.ray.at(at, new THREE.Vector3());
}

function calcRadialPosition(theta, y, origin) {
  return new THREE.Vector3(
    origin.x + Math.cos(theta + Math.PI / 2) * y,
    origin.y + Math.sin(theta - Math.PI / 2) * y,
    origin.z + Math.cos(theta + Math.PI / 2) * y
  );
}

function createCurveLine(lineVertices, material, name = "line") {
  var curve = new THREE.CatmullRomCurve3(lineVertices),
    curvePoints = curve.getPoints(config.line_segments),
    lineGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);

  lineGeometry.verticesNeedUpdate = true;
  lineGeometry.setDrawRange(0, 1);

  const curvedLine = new THREE.Line(lineGeometry, material);
  curvedLine.name = name;
  return curvedLine;
}

// previous render logic below:

// var i = 0,
//   j = 0;

// // t = percent of transition done
// const t = Math.min(1, Math.max(0, (count - transitionStart) / 10));

// for (var ix = 0; ix < AMOUNTX; ix++) {
//   for (var iy = 0; iy < AMOUNTY; iy++) {
//     const slug = ix + "," + iy;
//     const inGroup = selection.has(slug);
//     const x = xpos(ix);
//     const y = ypos(ix, iy, count);
//     const z = zpos(iy);

//     let v2x, v2y, v2z;

//     // starting position
//     if (inGroup) {
//       const worldVector = radialTree.get(slug);
//       v2x = worldVector.x;
//       v2y = worldVector.y;
//       v2z = worldVector.z;
//     }

//     // VIEW 0
//     // transitions between radial position and starting position
//     if (view === 0) {
//       // const tween = new TWEEN.Tween(positions[i]).to({});

//       positions[i] = inGroup ? interpolate(v2x, x, t) : x;
//       positions[i + 1] = inGroup ? interpolate(v2y, y, t) : y;
//       positions[i + 2] = inGroup ? interpolate(v2z, z, t) : z;

//       scales[j] = 32;
//       scales[j] =
//         (Math.sin((ix + count) * 0.3) + 1) * 8 +
//         (Math.sin((iy + count) * 0.5) + 1) * 8;

//       // VIEW 1
//       // raise points up out of the field
//     } else if (view === 1) {
//       positions[i] = x;
//       positions[i + 1] = inGroup
//         ? interpolate(ypos(ix, iy, transitionStart), 400, t)
//         : y;
//       positions[i + 2] = z;

//       scales[j] = inGroup
//         ? interpolate(16, 40, t)
//         : (Math.sin((ix + count) * 0.3) + 1) * 8 +
//           (Math.sin((iy + count) * 0.5) + 1) * 8;

//       // VIEW 2
//       // forms radial view
//     } else if (view === 2) {
//       positions[i] = inGroup ? interpolate(x, v2x, t) : x;
//       positions[i + 1] = inGroup ? interpolate(400, v2y, t) : y;
//       positions[i + 2] = inGroup ? interpolate(z, v2z, t) : z;

//       scales[j] = inGroup ? interpolate(40, 40, t) : interpolate(16, 8, t);
//     }

//     i += 3;
//     j++;
//   }
// }

// var curve = new THREE.CatmullRomCurve3(
//   selectionTree.children.map(({ id }) => {
//     const i = +id.split(",")[0] * AMOUNTX + +id.split(",")[1];
//     return new THREE.Vector3(
//       positions[i * 3],
//       positions[i * 3 + 1],
//       positions[i * 3 + 2]
//     );
//   })
// );

// var curvePoints = curve.getPoints(100);
// lines["root"].setFromPoints(curvePoints);
// lines["root"].verticesNeedUpdate = true;
