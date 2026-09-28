// inspect_ai_dna.jsx
// Extracts complete Vector Design DNA from an Adobe Illustrator (.ai, .eps, .pdf, .svg) document.
// Works on both macOS and Windows inside Adobe Illustrator ExtendScript (ES3).

function rgbToHex(r, g, b) {
    function c(v) {
        var n = Math.max(0, Math.min(255, Math.round(v)));
        var s = n.toString(16).toUpperCase();
        return s.length === 1 ? "0" + s : s;
    }
    return "#" + c(r) + c(g) + c(b);
}

function cmykToHex(c, m, y, k) {
    var r = 255 * (1 - c / 100) * (1 - k / 100);
    var g = 255 * (1 - m / 100) * (1 - k / 100);
    var b = 255 * (1 - y / 100) * (1 - k / 100);
    return rgbToHex(r, g, b);
}

function colorToInfo(col) {
    if (!col) return { type: "none", hex: null };
    try {
        var t = col.typename;
        if (t === "RGBColor") {
            return { type: "RGBColor", hex: rgbToHex(col.red, col.green, col.blue) };
        } else if (t === "CMYKColor") {
            return { type: "CMYKColor", hex: cmykToHex(col.cyan, col.magenta, col.yellow, col.black) };
        } else if (t === "GrayColor") {
            var v = Math.round(255 * (1 - col.gray / 100));
            return { type: "GrayColor", hex: rgbToHex(v, v, v) };
        } else if (t === "SpotColor" && col.spot && col.spot.color) {
            var inner = colorToInfo(col.spot.color);
            return { type: "SpotColor", name: col.spot.name, hex: inner.hex };
        } else if (t === "GradientColor" && col.gradient) {
            var stops = [];
            for (var i = 0; i < col.gradient.gradientStops.length; i++) {
                var gs = col.gradient.gradientStops[i];
                var sc = colorToInfo(gs.color);
                stops.push({
                    rampPoint: Math.round(gs.rampPoint * 10) / 10,
                    midPoint: Math.round(gs.midPoint * 10) / 10,
                    opacity: Math.round(gs.opacity * 10) / 10,
                    hex: sc.hex
                });
            }
            return {
                type: "GradientColor",
                name: col.gradient.name,
                gradientType: String(col.gradient.type),
                angle: Math.round(col.angle * 10) / 10,
                stops: stops
            };
        } else if (t === "NoColor") {
            return { type: "NoColor", hex: null };
        }
    } catch (e) {}
    return { type: "unknown", hex: null };
}

function inspectAiDocument(filePath, previewPngPath) {
    var prevInteraction = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    var openedTemp = false;
    var doc = null;

    try {
        if (filePath && filePath.length > 0) {
            var f = new File(filePath);
            if (!f.exists) {
                return { error: "File does not exist: " + filePath };
            }
            doc = app.open(f);
            openedTemp = true;
        } else {
            if (app.documents.length === 0) {
                return { error: "No active document open in Adobe Illustrator." };
            }
            doc = app.activeDocument;
        }

        var result = {
            name: doc.name,
            colorSpace: String(doc.documentColorSpace),
            width: Math.round(doc.width),
            height: Math.round(doc.height),
            artboards: [],
            layers: [],
            swatches: [],
            gradients: [],
            typography: [],
            vector_paths_summary: {
                total_paths: doc.pathItems.length,
                compound_paths: doc.compoundPathItems.length,
                placed_items: doc.placedItems.length,
                raster_items: doc.rasterItems.length,
                stroke_weights_pt: [],
                fill_colors: [],
                stroke_colors: []
            },
            sample_paths: [],
            preview_png: null
        };

        // 1. Artboards
        for (var a = 0; a < doc.artboards.length; a++) {
            var ab = doc.artboards[a];
            var r = ab.artboardRect; // [left, top, right, bottom]
            var w = Math.round(Math.abs(r[2] - r[0]));
            var h = Math.round(Math.abs(r[1] - r[3]));
            result.artboards.push({
                index: a,
                name: ab.name,
                width: w,
                height: h,
                rect: [Math.round(r[0]), Math.round(r[1]), Math.round(r[2]), Math.round(r[3])]
            });
        }

        // 2. Layers
        for (var l = 0; l < doc.layers.length; l++) {
            var lyr = doc.layers[l];
            var subNames = [];
            for (var sl = 0; sl < lyr.layers.length; sl++) {
                subNames.push(lyr.layers[sl].name);
            }
            result.layers.push({
                name: lyr.name,
                visible: lyr.visible,
                locked: lyr.locked,
                sublayers: subNames,
                path_count: lyr.pathItems.length,
                text_count: lyr.textFrames.length,
                group_count: lyr.groupItems.length
            });
        }

        // 3. Swatches & Gradients
        var seenSwatches = {};
        for (var s = 0; s < Math.min(doc.swatches.length, 60); s++) {
            var sw = doc.swatches[s];
            var ci = colorToInfo(sw.color);
            if (ci.hex && !seenSwatches[ci.hex]) {
                seenSwatches[ci.hex] = true;
                result.swatches.push({ name: sw.name, hex: ci.hex, type: ci.type });
            }
        }
        for (var g = 0; g < Math.min(doc.gradients.length, 25); g++) {
            var gr = doc.gradients[g];
            var gStops = [];
            for (var gsIdx = 0; gsIdx < gr.gradientStops.length; gsIdx++) {
                var st = gr.gradientStops[gsIdx];
                var stCol = colorToInfo(st.color);
                gStops.push({
                    rampPoint: Math.round(st.rampPoint),
                    hex: stCol.hex
                });
            }
            result.gradients.push({
                name: gr.name,
                type: String(gr.type),
                stops: gStops
            });
        }

        // 4. Typography (TextFrames)
        var maxText = Math.min(doc.textFrames.length, 60);
        for (var tIdx = 0; tIdx < maxText; tIdx++) {
            try {
                var tf = doc.textFrames[tIdx];
                var contents = tf.contents || "";
                if (contents.length === 0) continue;
                var ca = tf.textRange.characterAttributes;
                var fontName = "";
                var fontFamily = "";
                try {
                    fontName = ca.textFont ? ca.textFont.name : "";
                    fontFamily = ca.textFont ? ca.textFont.family : "";
                } catch (eFont) {}
                var fillCol = colorToInfo(ca.fillColor);
                result.typography.push({
                    name: tf.name || contents.substring(0, 32),
                    text: contents.substring(0, 140),
                    font_postscript: fontName,
                    font_family: fontFamily,
                    size_pt: Math.round(ca.size * 10) / 10,
                    leading_pt: ca.autoLeading ? "auto" : Math.round(ca.leading * 10) / 10,
                    tracking: ca.tracking,
                    color_hex: fillCol.hex,
                    kind: String(tf.kind),
                    position: [Math.round(tf.left), Math.round(tf.top)],
                    bounds: [Math.round(tf.width), Math.round(tf.height)]
                });
            } catch (eTf) {}
        }

        // 5. Vector Paths Summary & Sample Paths
        var seenFill = {};
        var seenStroke = {};
        var seenWeights = {};
        var maxPaths = Math.min(doc.pathItems.length, 150);
        for (var pIdx = 0; pIdx < maxPaths; pIdx++) {
            try {
                var pi = doc.pathItems[pIdx];
                var fInfo = pi.filled ? colorToInfo(pi.fillColor) : { type: "NoColor", hex: null };
                var sInfo = pi.stroked ? colorToInfo(pi.strokeColor) : { type: "NoColor", hex: null };
                if (fInfo.hex && !seenFill[fInfo.hex]) {
                    seenFill[fInfo.hex] = true;
                    result.vector_paths_summary.fill_colors.push(fInfo.hex);
                }
                if (sInfo.hex && !seenStroke[sInfo.hex]) {
                    seenStroke[sInfo.hex] = true;
                    result.vector_paths_summary.stroke_colors.push(sInfo.hex);
                }
                if (pi.stroked && pi.strokeWidth > 0) {
                    var swRound = Math.round(pi.strokeWidth * 100) / 100;
                    if (!seenWeights[swRound]) {
                        seenWeights[swRound] = true;
                        result.vector_paths_summary.stroke_weights_pt.push(swRound);
                    }
                }
                if (result.sample_paths.length < 35) {
                    result.sample_paths.push({
                        name: pi.name || ("Path_" + pIdx),
                        layer: pi.layer ? pi.layer.name : "",
                        closed: pi.closed,
                        points: pi.pathPoints ? pi.pathPoints.length : 0,
                        filled: pi.filled,
                        fill: fInfo,
                        stroked: pi.stroked,
                        stroke: sInfo,
                        stroke_width: pi.stroked ? Math.round(pi.strokeWidth * 100) / 100 : 0,
                        opacity: Math.round(pi.opacity),
                        width: Math.round(pi.width),
                        height: Math.round(pi.height)
                    });
                }
            } catch (ePath) {}
        }

        // 6. Export Artboard PNG Preview if requested
        if (previewPngPath && previewPngPath.length > 0) {
            try {
                var outPng = new File(previewPngPath);
                var exportOpts = new ExportOptionsPNG24();
                exportOpts.antiAliasing = true;
                exportOpts.transparency = true;
                exportOpts.artBoardClipping = true;
                exportOpts.horizontalScale = 100;
                exportOpts.verticalScale = 100;
                doc.exportFile(outPng, ExportType.PNG24, exportOpts);
                result.preview_png = previewPngPath;
            } catch (eExport) {
                result.preview_export_error = String(eExport);
            }
        }

        if (openedTemp) {
            doc.close(SaveOptions.DONOTSAVECHANGES);
        }

        app.userInteractionLevel = prevInteraction;
        return result;
    } catch (err) {
        if (openedTemp && doc) {
            try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
        }
        app.userInteractionLevel = prevInteraction;
        return { error: String(err), line: err.line };
    }
}
