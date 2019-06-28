// @author brunoimbrizi / http://brunoimbrizi.com

precision highp float;

uniform sampler2D uTexture;
uniform float uRandom;

varying vec2 vPUv;
varying vec2 vUv;

void main() {
	vec4 color = vec4(0.0);
	vec2 uv = vUv;
	vec2 puv = vPUv;

	// pixel color
	vec4 colA = texture2D(uTexture, puv);

	// greyscale
	// float grey = colA.r * 0.21 + colA.g * 0.71 + colA.b * 0.07;
	// vec4 colB = vec4(grey, grey, grey, 1.0);
	// vec4 colB = vec4(colA.r, colA.g, colA.b, 1.0);
	vec4 colB = vec4(colA.r, colA.g, colA.b, 1.0);

	// circle
	float border = 0.6;
	float radius = 0.5;
	float dist = radius - distance(uv, vec2(0.5));
	float t = smoothstep(0.0, border, dist);

	// final color
	color = colB;

	// color.a = t; // makes them round pixels
	// float shape = uRandom > 0.2 ?  1.0 : t;
	// color.a = 1.0; // to make them squares
	float clamped = clamp(uRandom, t,1.0);
	color.a = clamped; // transition between round and squares

	gl_FragColor = color;
}