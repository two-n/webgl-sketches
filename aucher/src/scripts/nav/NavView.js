import "three";
import * as d3 from "d3";
import "../utils/CSS3DRenderer";
import { getIthPoint } from "../utils/math.utils";

const DISCOVER = "discover";
const PLAN = "plan";
const LIVE = "live";
const RELIVE = "relive";

export default class Nav {
  constructor(app) {
    this.app = app;

    this.phaseMapping = {
      [DISCOVER]: 1,
      [PLAN]: 2,
      [LIVE]: 3,
      [RELIVE]: 4,
    };

    this.width = Math.min(window.innerWidth, window.innerHeight);
    this.height = Math.min(window.innerWidth, window.innerHeight);
    this.initNav();
  }

  initNav() {
    d3.json("data.json")
      .then(
        data =>
          (this.fanJourney = data["Fan Journey"].filter(
            d => d["Node Hierarchy"] < 4
          ))
      )
      .then(() => this.draw());
  }

  draw() {
    this.radius = 10;
    this.bigRadius = (this.width * 0.8) / 2;

    const stratefied = d3
      .stratify()
      .id(d => d["ref"])
      .parentId(d => d["Parent Node ID"])([
      { ["ref"]: "root", ["Parent Node ID"]: "" },
      ...this.fanJourney,
    ]);

    const hierarchy = d3.hierarchy(stratefied);
    const nodes = [];
    hierarchy.eachBefore(d => nodes.push(d));
    console.log("nodes", nodes);

    const svg = d3
      .select(".container")
      .append("svg")
      .attr("class", "Nav")
      .attr("width", this.width)
      .attr("height", this.height);
    const group = svg
      .append("g")
      .style(
        "transform",
        "translate(" + this.width / 2 + "px, " + this.height / 2 + "px)"
      );

    const circles = group
      .selectAll("circle")
      .data(
        nodes.filter(
          d => d.data.data["ref"] != "root" && d.data.data["Node Name"]
        )
      )
      .enter()
      .append("circle")
      .attr("r", d => this.radius * (4 - d.data.data["Node Hierarchy"]))
      .attr("cx", (d, i, n) => getIthPoint(i, n.length, this.bigRadius)[0])
      .attr("cy", (d, i, n) => getIthPoint(i, n.length, this.bigRadius)[1])
      .attr("class", d => (d.data.data["Node Hierarchy"] === 1 ? "L1" : ""));

    d3.selectAll(".L1")
      .clone()
      .attr("r", this.radius * 2)
      .attr("fill", "#E31937")
      .on("click", (d, i) => {
        this.app.webgl.goto(i);
      });
  }

  resize() {
    // TODO: update for what svg needs
  }
}
