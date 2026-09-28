// ai_vector_builder.jsx
// Live Foreground Step-by-Step Vector Builder for Adobe Illustrator (macOS & Windows).
// Draws 100% native editable vector layers, gradients, shapes, bento cards, and typography
// with immediate app.redraw() calls so the user watches every element appear live on screen.

function aiForceCanvasRedraw() {
    try {
        app.redraw();
    } catch (e) {}
}

function aiHexToRGBColor(hex) {
    var clean = String(hex || "#FFFFFF").replace("#", "");
    if (clean.length === 3) {
        clean = clean.charAt(0) + clean.charAt(0) + clean.charAt(1) + clean.charAt(1) + clean.charAt(2) + clean.charAt(2);
    }
    var num = parseInt(clean, 16);
    if (isNaN(num)) num = 0xFFFFFF;
    var c = new RGBColor();
    c.red = (num >> 16) & 255;
    c.green = (num >> 8) & 255;
    c.blue = num & 255;
    return c;
}

function aiGetArtboardMetrics(doc) {
    var idx = doc.artboards.getActiveArtboardIndex();
    var rect = doc.artboards[idx].artboardRect; // [left, top, right, bottom]
    return {
        left: rect[0],
        top: rect[1],
        right: rect[2],
        bottom: rect[3],
        width: Math.abs(rect[2] - rect[0]),
        height: Math.abs(rect[1] - rect[3])
    };
}

function aiX(doc, x) {
    var ab = aiGetArtboardMetrics(doc);
    return ab.left + (Number(x) || 0);
}

function aiY(doc, y) {
    var ab = aiGetArtboardMetrics(doc);
    return ab.top - (Number(y) || 0);
}

function aiGetOrCreateLayer(doc, layerName) {
    for (var i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].name === layerName) {
            doc.layers[i].locked = false;
            doc.layers[i].visible = true;
            doc.activeLayer = doc.layers[i];
            return doc.layers[i];
        }
    }
    var lyr = doc.layers.add();
    lyr.name = layerName;
    doc.activeLayer = lyr;
    return lyr;
}

function aiFindFont(fontName) {
    var candidates = [];
    if (fontName) candidates.push(fontName);
    candidates.push("Inter-Bold", "Inter-Regular", "PlusJakartaSans-Bold", "Arial-BoldMT", "ArialMT", "Helvetica-Bold", "Helvetica");
    for (var i = 0; i < candidates.length; i++) {
        try {
            var f = app.textFonts.getByName(candidates[i]);
            if (f) return f;
        } catch (e) {}
    }
    return app.textFonts.length > 0 ? app.textFonts[0] : null;
}

function aiCreateGradientColor(doc, gradSpec, nameHint) {
    try {
        var gradName = (nameHint || "DNA_Grad") + "_" + Math.floor(Math.random() * 100000);
        var grad = doc.gradients.add();
        grad.name = gradName;
        grad.type = (gradSpec.type && String(gradSpec.type).toLowerCase() === "radial")
            ? GradientType.RADIAL
            : GradientType.LINEAR;

        var stops = gradSpec.stops || [
            { color: "#0F172A", location: 0 },
            { color: "#1E1B4B", location: 100 }
        ];

        while (grad.gradientStops.length < stops.length) {
            grad.gradientStops.add();
        }

        for (var i = 0; i < stops.length; i++) {
            var st = grad.gradientStops[i];
            st.rampPoint = Math.max(0, Math.min(100, Number(stops[i].location !== undefined ? stops[i].location : (i * 100 / Math.max(1, stops.length - 1)))));
            st.color = aiHexToRGBColor(stops[i].color || "#000000");
            if (stops[i].opacity !== undefined) {
                st.opacity = Number(stops[i].opacity);
            }
        }

        var gc = new GradientColor();
        gc.gradient = grad;
        gc.angle = Number(gradSpec.angle !== undefined ? gradSpec.angle : -45);
        return gc;
    } catch (e) {
        var fallbackHex = (gradSpec && gradSpec.stops && gradSpec.stops.length > 0) ? gradSpec.stops[0].color : "#0F172A";
        return aiHexToRGBColor(fallbackHex);
    }
}

function aiApplyAppearance(pathItem, doc, specItem) {
    if (specItem.gradient) {
        pathItem.filled = true;
        pathItem.fillColor = aiCreateGradientColor(doc, specItem.gradient, specItem.name || "Grad");
    } else if (specItem.fill_color && specItem.fill_color !== "none") {
        pathItem.filled = true;
        pathItem.fillColor = aiHexToRGBColor(specItem.fill_color);
    } else {
        pathItem.filled = false;
    }

    if (specItem.stroke_color && specItem.stroke_color !== "none" && Number(specItem.stroke_width || 1) > 0) {
        pathItem.stroked = true;
        pathItem.strokeColor = aiHexToRGBColor(specItem.stroke_color);
        pathItem.strokeWidth = Number(specItem.stroke_width || 1);
        if (specItem.dashed && specItem.dashed.length > 0) {
            pathItem.strokeDashes = specItem.dashed;
        }
    } else {
        pathItem.stroked = false;
    }

    if (specItem.opacity !== undefined) {
        pathItem.opacity = Math.max(0, Math.min(100, Number(specItem.opacity)));
    }
}

function aiDrawShapeItem(doc, container, item) {
    var t = String(item.type || "rounded_rect").toLowerCase();
    var left = aiX(doc, item.x || 0);
    var top = aiY(doc, item.y || 0);
    var w = Number(item.width || 200);
    var h = Number(item.height || 200);
    var p = null;

    if (t === "ellipse" || t === "circle") {
        p = container.pathItems.ellipse(top, left, w, h);
    } else if (t === "rect" || t === "rectangle") {
        p = container.pathItems.rectangle(top, left, w, h);
    } else if (t === "rounded_rect") {
        var r = Number(item.radius !== undefined ? item.radius : 20);
        p = container.pathItems.roundedRectangle(top, left, w, h, r, r);
    } else if (t === "polygon") {
        var cx = left + w / 2;
        var cy = top - h / 2;
        var rad = Math.min(w, h) / 2;
        var sides = Number(item.sides || 6);
        p = container.pathItems.polygon(cx, cy, rad, sides);
    } else if (t === "star") {
        var sx = left + w / 2;
        var sy = top - h / 2;
        var outerR = Math.min(w, h) / 2;
        var innerR = Number(item.inner_radius || (outerR * 0.48));
        var pts = Number(item.points || 5);
        p = container.pathItems.star(sx, sy, outerR, innerR, pts);
    } else if (t === "line") {
        p = container.pathItems.add();
        var x2 = aiX(doc, item.x2 !== undefined ? item.x2 : (Number(item.x || 0) + w));
        var y2 = aiY(doc, item.y2 !== undefined ? item.y2 : (Number(item.y || 0) + h));
        p.setEntirePath([[left, top], [x2, y2]]);
        p.closed = false;
    } else if (t === "bezier_path" && item.points && item.points.length > 1) {
        p = container.pathItems.add();
        for (var i = 0; i < item.points.length; i++) {
            var ptSpec = item.points[i];
            var pp = p.pathPoints.add();
            var ax = aiX(doc, ptSpec.anchor[0]);
            var ay = aiY(doc, ptSpec.anchor[1]);
            pp.anchor = [ax, ay];
            pp.leftDirection = ptSpec.left ? [aiX(doc, ptSpec.left[0]), aiY(doc, ptSpec.left[1])] : [ax, ay];
            pp.rightDirection = ptSpec.right ? [aiX(doc, ptSpec.right[0]), aiY(doc, ptSpec.right[1])] : [ax, ay];
            pp.pointType = (ptSpec.left || ptSpec.right) ? PointType.SMOOTH : PointType.CORNER;
        }
        p.closed = item.closed !== false;
    } else {
        var rDef = Number(item.radius !== undefined ? item.radius : 16);
        p = container.pathItems.roundedRectangle(top, left, w, h, rDef, rDef);
    }

    if (p) {
        p.name = item.name || ("Vector_" + t);
        aiApplyAppearance(p, doc, item);
        aiForceCanvasRedraw();
    }
    return p;
}

function aiAddTextItem(doc, container, tSpec) {
    var content = String(tSpec.text || "").replace(/\\n/g, "\r").replace(/\n/g, "\r");
    var left = aiX(doc, tSpec.x || 80);
    var top = aiY(doc, tSpec.y || 120);
    var tf = null;

    if (tSpec.area_text && tSpec.width && tSpec.height) {
        var areaRect = container.pathItems.rectangle(top, left, Number(tSpec.width), Number(tSpec.height));
        tf = container.textFrames.areaText(areaRect);
    } else {
        tf = container.textFrames.pointText([left, top]);
    }

    tf.name = tSpec.name || "Text_Item";
    tf.contents = content;

    var tr = tf.textRange;
    var ca = tr.characterAttributes;
    var fontObj = aiFindFont(tSpec.font);
    if (fontObj) {
        try { ca.textFont = fontObj; } catch (eF) {}
    }
    var fSize = Number(tSpec.size || 32);
    ca.size = fSize;

    if (tSpec.leading !== undefined) {
        ca.autoLeading = false;
        ca.leading = Number(tSpec.leading);
    } else {
        ca.autoLeading = false;
        ca.leading = Math.round(fSize * 1.22);
    }

    if (tSpec.tracking !== undefined) {
        ca.tracking = Number(tSpec.tracking);
    }

    ca.fillColor = aiHexToRGBColor(tSpec.color || "#FFFFFF");

    if (tSpec.align) {
        var al = String(tSpec.align).toLowerCase();
        var just = Justification.LEFT;
        if (al === "center") just = Justification.CENTER;
        else if (al === "right") just = Justification.RIGHT;
        for (var p = 0; p < tf.paragraphs.length; p++) {
            try { tf.paragraphs[p].paragraphAttributes.justification = just; } catch (eJ) {}
        }
    }

    if (tSpec.opacity !== undefined) {
        tf.opacity = Number(tSpec.opacity);
    }

    aiForceCanvasRedraw();
    return tf;
}

function aiFindOrCreateDoc(spec, createFresh) {
    var docName = spec.doc_name || "Illustrator_Design_DNA";
    var w = Number(spec.width || 1080);
    var h = Number(spec.height || 1350);

    if (!createFresh && app.documents.length > 0) {
        for (var i = 0; i < app.documents.length; i++) {
            if (app.documents[i].name.indexOf(docName) === 0 || app.documents[i].name === docName + ".ai") {
                app.activeDocument = app.documents[i];
                return app.documents[i];
            }
        }
        return app.activeDocument;
    }

    var preset = new DocumentPreset();
    preset.title = docName;
    preset.width = w;
    preset.height = h;
    preset.colorMode = DocumentColorSpace.RGB;
    preset.units = RulerUnits.Pixels;
    var doc = app.documents.addDocument(DocumentColorSpace.RGB, preset);
    aiForceCanvasRedraw();
    return doc;
}

function buildVectorFromSpec(spec, stage) {
    var prevInteraction = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    var activeStage = stage || "all";

    try {
        var isFirstStage = (activeStage === "all" || activeStage === "stage_1_background");
        var doc = aiFindOrCreateDoc(spec, isFirstStage);
        var ab = aiGetArtboardMetrics(doc);

        // STAGE 1: 01_BACKGROUND
        if (activeStage === "all" || activeStage === "stage_1_background") {
            var bgLayer = aiGetOrCreateLayer(doc, "01_BACKGROUND");
            // Remove default empty "Layer 1" if present
            for (var l = doc.layers.length - 1; l >= 0; l--) {
                if (doc.layers[l].name === "Layer 1" && doc.layers[l].pageItems.length === 0 && doc.layers.length > 1) {
                    try { doc.layers[l].remove(); } catch (eR) {}
                }
            }
            var bgSpec = spec.background || { color: "#090D16" };
            aiDrawShapeItem(doc, bgLayer, {
                name: "Artboard_Background_Vector",
                type: "rect",
                x: 0,
                y: 0,
                width: ab.width,
                height: ab.height,
                fill_color: bgSpec.color || "#090D16",
                gradient: bgSpec.gradient || null
            });

            if (bgSpec.grid && bgSpec.grid.enabled) {
                var gridGroup = bgLayer.groupItems.add();
                gridGroup.name = "Vector_Geometric_Grid";
                var step = Number(bgSpec.grid.spacing || 90);
                var gColor = bgSpec.grid.color || "#1E293B";
                var gStroke = Number(bgSpec.grid.stroke_width || 0.75);
                var gOpacity = Number(bgSpec.grid.opacity !== undefined ? bgSpec.grid.opacity : 20);

                for (var gx = step; gx < ab.width; gx += step) {
                    aiDrawShapeItem(doc, gridGroup, {
                        name: "Grid_V_" + gx,
                        type: "line",
                        x: gx,
                        y: 0,
                        x2: gx,
                        y2: ab.height,
                        stroke_color: gColor,
                        stroke_width: gStroke,
                        opacity: gOpacity
                    });
                }
                for (var gy = step; gy < ab.height; gy += step) {
                    aiDrawShapeItem(doc, gridGroup, {
                        name: "Grid_H_" + gy,
                        type: "line",
                        x: 0,
                        y: gy,
                        x2: ab.width,
                        y2: gy,
                        stroke_color: gColor,
                        stroke_width: gStroke,
                        opacity: gOpacity
                    });
                }
            }
            aiForceCanvasRedraw();
        }

        // STAGE 2: 02_VECTOR_SHAPES
        if (activeStage === "all" || activeStage === "stage_2_shapes") {
            var shapesLayer = aiGetOrCreateLayer(doc, "02_VECTOR_SHAPES");
            var shapes = spec.vector_shapes || [];
            for (var s = 0; s < shapes.length; s++) {
                aiDrawShapeItem(doc, shapesLayer, shapes[s]);
            }
            aiForceCanvasRedraw();
        }

        // STAGE 3: 03_CARDS_AND_ILLUSTRATION
        if (activeStage === "all" || activeStage === "stage_3_cards") {
            var cardsLayer = aiGetOrCreateLayer(doc, "03_CARDS_AND_ILLUSTRATION");
            var cards = spec.cards || [];
            for (var c = 0; c < cards.length; c++) {
                aiDrawShapeItem(doc, cardsLayer, cards[c]);
            }
            var assets = spec.placed_assets || [];
            for (var a = 0; a < assets.length; a++) {
                var assetSpec = assets[a];
                if (assetSpec.path) {
                    var af = new File(assetSpec.path);
                    if (af.exists) {
                        try {
                            var placed = cardsLayer.placedItems.add();
                            placed.file = af;
                            placed.name = assetSpec.name || "Placed_Asset";
                            if (assetSpec.width) placed.width = Number(assetSpec.width);
                            if (assetSpec.height) placed.height = Number(assetSpec.height);
                            placed.left = aiX(doc, assetSpec.x || 0);
                            placed.top = aiY(doc, assetSpec.y || 0);
                            if (assetSpec.embed) {
                                try { placed.embed(); } catch (eEmb) {}
                            }
                            aiForceCanvasRedraw();
                        } catch (ePl) {}
                    }
                }
            }
            aiForceCanvasRedraw();
        }

        // STAGE 4: 04_TYPOGRAPHY
        if (activeStage === "all" || activeStage === "stage_4_typography") {
            var typoLayer = aiGetOrCreateLayer(doc, "04_TYPOGRAPHY");
            var texts = spec.typography || [];
            for (var t = 0; t < texts.length; t++) {
                aiAddTextItem(doc, typoLayer, texts[t]);
            }
            aiForceCanvasRedraw();
        }

        // STAGE 5: 05_CTA_AND_BADGES + SAVE/EXPORT
        if (activeStage === "all" || activeStage === "stage_5_cta_and_export") {
            if (spec.cta) {
                var ctaLayer = aiGetOrCreateLayer(doc, "05_CTA_AND_BADGES");
                var cta = spec.cta;
                var ctaGroup = ctaLayer.groupItems.add();
                ctaGroup.name = cta.name || "CTA_Button_Group";

                var btnW = Number(cta.width || 420);
                var btnH = Number(cta.height || 88);
                var btnX = Number(cta.x || 84);
                var btnY = Number(cta.y || (ab.height - 180));

                aiDrawShapeItem(doc, ctaGroup, {
                    name: "CTA_Pill_Vector",
                    type: "rounded_rect",
                    x: btnX,
                    y: btnY,
                    width: btnW,
                    height: btnH,
                    radius: Number(cta.radius !== undefined ? cta.radius : (btnH / 2)),
                    fill_color: cta.fill_color || "#6366F1",
                    gradient: cta.gradient || null,
                    stroke_color: cta.stroke_color || "none",
                    stroke_width: Number(cta.stroke_width || 0)
                });

                var fSize = Number(cta.font_size || 24);
                var labelY = btnY + Math.round((btnH - fSize) / 2) - 4;
                aiAddTextItem(doc, ctaGroup, {
                    name: "CTA_Label_Text",
                    text: cta.text || "GET STARTED",
                    x: btnX + Math.round(btnW / 2),
                    y: labelY,
                    font: cta.font || "Arial-BoldMT",
                    size: fSize,
                    tracking: cta.tracking !== undefined ? cta.tracking : 50,
                    color: cta.text_color || "#FFFFFF",
                    align: "center"
                });
            }

            aiForceCanvasRedraw();

            var savedFiles = {};

            // 1. Save Native .ai
            if (spec.output_ai) {
                try {
                    var aiFile = new File(spec.output_ai);
                    if (aiFile.parent && !aiFile.parent.exists) aiFile.parent.create();
                    var aiOpts = new IllustratorSaveOptions();
                    aiOpts.pdfCompatible = true;
                    aiOpts.embedICCProfile = true;
                    aiOpts.compressed = true;
                    doc.saveAs(aiFile, aiOpts);
                    savedFiles.output_ai = spec.output_ai;
                } catch (eAi) {
                    savedFiles.ai_error = String(eAi);
                }
            }

            // 2. Export Scalable Vector .svg
            if (spec.output_svg) {
                try {
                    var svgFile = new File(spec.output_svg);
                    if (svgFile.parent && !svgFile.parent.exists) svgFile.parent.create();
                    var svgOpts = new ExportOptionsSVG();
                    svgOpts.embedRasterImages = true;
                    svgOpts.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;
                    svgOpts.fontSubsetting = SVGFontSubsetting.None;
                    svgOpts.documentEncoding = SVGDocumentEncoding.UTF8;
                    doc.exportFile(svgFile, ExportType.SVG, svgOpts);
                    savedFiles.output_svg = spec.output_svg;
                } catch (eSvg) {
                    savedFiles.svg_error = String(eSvg);
                }
            }

            // 3. Export High-Resolution .png Preview
            if (spec.output_png) {
                try {
                    var pngFile = new File(spec.output_png);
                    if (pngFile.parent && !pngFile.parent.exists) pngFile.parent.create();
                    var pngOpts = new ExportOptionsPNG24();
                    pngOpts.antiAliasing = true;
                    pngOpts.transparency = false;
                    pngOpts.artBoardClipping = true;
                    pngOpts.horizontalScale = 100;
                    pngOpts.verticalScale = 100;
                    doc.exportFile(pngFile, ExportType.PNG24, pngOpts);
                    savedFiles.output_png = spec.output_png;
                } catch (ePng) {
                    savedFiles.png_error = String(ePng);
                }
            }

            app.userInteractionLevel = prevInteraction;
            return {
                status: "success",
                stage: activeStage,
                document: doc.name,
                artboard_width: ab.width,
                artboard_height: ab.height,
                layers_count: doc.layers.length,
                saved: savedFiles
            };
        }

        app.userInteractionLevel = prevInteraction;
        return {
            status: "success",
            stage: activeStage,
            document: doc.name,
            layers_count: doc.layers.length
        };
    } catch (err) {
        app.userInteractionLevel = prevInteraction;
        return { error: String(err), line: err.line, stage: activeStage };
    }
}
