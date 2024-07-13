import { createRequire } from "module"
const require = createRequire(import.meta.url);

import path, {dirname} from 'path';
import React from 'react';
import ReactDomServer from 'react-dom/server';
import htmlmin from 'gulp-htmlmin';
import del from 'del';
import rename from 'gulp-rename';
import through2 from 'through2';
import * as vm from "vm";
import gulp from 'gulp';
import {fileURLToPath} from "url";
import projectLoader from "./app/project-loader.js";
import {promisify} from "util";
import fs from "fs";
import clientRollupConfig from "./client-rollup-config.js";
import serverRollupConfig from "./server-rollup-config.js";
import cleanCss from "gulp-clean-css";

import {rollup} from "rollup";
const os = require('os');
const parallel = require('concurrent-transform');

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);
const sass = require('sass');
const gulpSass = require('gulp-sass')(sass);

const Jimp = require("jimp");
const appConfig = require('./app-config.json');

const numberOfCpus = os.cpus().length;

const nodeModuleDir = path.join(__dirname, './node_modules');

const promiseMkDir = promisify(fs.mkdir);
const promiseCopyFile = promisify(fs.copyFile);
const promiseStream = (gulpStream) => new Promise((resolve, reject) => gulpStream.on('end', resolve).on('error', reject));

let outputDir = path.join(__dirname, './build');
const getOutputDir = (relativeDir) => path.join(outputDir, relativeDir || '');
const getInputDir = (relativeDir) => path.join(__dirname, relativeDir || '');

function jsxToHtml(options) {
	return through2.obj(function (file, enc, next) {
		try {
			require('node-jsx').install({extension: '.jsx'});

			let component = {};

			if (file.contents) {
				const js = file.contents.toString();
				const script = new vm.Script(`
((module, require) => {
${js}

return module.exports;
});
`);
				component = script.runInThisContext()(require('node:module'), require);
			}

			if (!component) {
				component = file.contents || require(file.path);
				component = component.default || component;
			}

			const markup = `<!doctype html>${ReactDomServer.renderToStaticMarkup(React.createElement(component, options))}`;
			file.contents = Buffer.from(markup);
			file.path = file.path.replace(path.extname(file.path), '.html');

			next(null, file);
		} catch (e) {
			next(e);
		}
	});
}

const cleanBuild = () => del(['build']);

const npmSassAliases = {};
/**
 * Will look for .scss|sass files inside the node_modules folder
 */
function npmSassResolver(url, file, done) {
	// check if the path was already found and cached
	if(npmSassAliases[url]) {
		return done({ file: npmSassAliases[url] });
	}

	// look for modules installed through npm
	try {
		const newPath = require.resolve(url);
		npmSassAliases[url] = newPath; // cache this request
		return done({ file: newPath });
	} catch(e) {
		// if your module could not be found, just return the original url
		npmSassAliases[url] = url;
		return done({ file: url });
	}
}

function deSassify() {
	return gulpSass(
		{
			importer: npmSassResolver
		}).on('error', gulpSass.logError);
}

// copy slick carousel blobs
function collectSlickBlobs() {
	return gulp
		.src([`${nodeModuleDir}/slick-carousel/slick/**/*.{woff,tff,gif,jpg,png}`])
		.pipe(gulp.dest(getOutputDir('public')));
}

// Bundle SASS
function transformSass() {
	return gulp.src(getInputDir('app/index/index.scss'))
		.pipe(deSassify())
		.pipe(cleanCss())
		.pipe(gulp.dest(getOutputDir('public')));
}

const buildCss = gulp.parallel(collectSlickBlobs, transformSass);

function copySvg() {
	return gulp
		.src('./app/index/*.svg')
		.pipe(gulp.dest(getOutputDir('public')));
}

async function buildProjectImages() {
	const inputDir = appConfig.projectsLocation;
	const projects = await projectLoader(inputDir);

	const destDir = getOutputDir('public/imgs/projects');
	await Promise.all(projects
		.flatMap(p => [p.image?.url, ...p.examples.map(i => i.url)])
		.filter(uri => uri)
		.map(async uri => {
			if (!uri || uri.startsWith("http://") || uri.startsWith("https://")) return;

			const destination = path.join(destDir, path.relative(inputDir, uri));
			if (path.extname(destination) === ".svg") {
				const directory = path.dirname(destination);
				console.log(`Making directory ${directory}.`);
				await promiseMkDir(directory, { recursive: true })
				await promiseCopyFile(uri, destination)
				return;
			}

			const image = await Jimp.read(uri);
			const resizedImage = image.resize(Jimp.AUTO, 300);
			await resizedImage.write(destination);
		}));
}

function buildClientJs() {
	const destDir = getOutputDir('public/js');

	return gulp.src(getInputDir('app/**/*.client.{js,jsx}'))
		.pipe(parallel(
			through2.obj(async (file, enc, next) => {
				try {
					const bundle = await rollup(Object.assign(
						clientRollupConfig,
						{
							input: file.path,
						}));

					const {output} = await bundle.generate({format: 'iife'});

					file.contents = Buffer.from(output[0].code);

					next(null, file);
				} catch (e) {
					next(e);
				}
			}),
			numberOfCpus))
		.pipe(rename({
			dirname: '',
			extname: '.js'
		}))
		.pipe(gulp.dest(destDir));
}

function bundleServerJs() {
	return through2.obj(async function (file, enc, next) {
		try {
			const bundle = await rollup(Object.assign(
				serverRollupConfig,
				{
					input: file.path,
				}));

			const { output } = await bundle.generate({format: 'cjs'});

			file.contents = Buffer.from(output[0].code);
			file.path = file.path.replace(path.extname(file.path), '.cjs');

			next(null, file);
		} catch (e) {
			next(e);
		}
	});
}

async function buildServerHtml() {
	const portfolios = await projectLoader(appConfig.projectsLocation);
	const projectsLocation = appConfig.projectsLocation;
	const imgDir = 'imgs/projects';
	for (const portfolio of portfolios) {
		const {image, examples} = portfolio;

		if (image) {
			image.url = path.join(imgDir, path.relative(projectsLocation, image.url));
		}

		for (const example of examples) {
			example.url = path.join(imgDir, path.relative(projectsLocation, example.url));
		}
	}

	await promiseStream(gulp
		.src('./app/index/index.jsx')
		.pipe(bundleServerJs())
		.pipe(jsxToHtml({projects: portfolios}))
		.pipe(htmlmin())
		.pipe(gulp.dest('./build/public')));
}

const build = gulp.series(
	cleanBuild,
	gulp.parallel(
		buildServerHtml,
		buildProjectImages,
		buildCss,
		copySvg,
		buildClientJs,
	),
)

// gulp.task('watch', ['build'], () => {
// 	gulp.watch('./app/**/*.{jsx,css,svg}', ['build-static']);
// });

export { build };