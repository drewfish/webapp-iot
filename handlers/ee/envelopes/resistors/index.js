var ME = module.exports,
    LIBS = {
        dot:    require('dot'),
        fs:     require('fs'),
        path:   require('path'),
        qs:     require('querystring'),
    },
    TEMPLATES = {},
    CONFIG = {
        // these are all pixels
        pageWidth:      800,
        pageHeight:     900,
        envelopeWidth:  400,
        envelopeHeight: 300,
        foldWidth:       37.5,
        foldHeight:     100,
        barSize:          5,
        barMargin:       40,
        barPadding:       5,
        boxSize:         30,
        boxPadding:       5,
    },
    COLORS_DIGIT = {
        '0':    'Bk',
        '1':    'Bn',
        '2':    'Rd',
        '3':    'Og',
        '4':    'Yw',
        '5':    'Gn',
        '6':    'Bl',
        '7':    'Vt',
        '8':    'Gy',
        '9':    'Wt',
    },
    COLORS_MULTIPLIER_POWER = {
        '-2':   'Sr',
        '-1':   'Gd',
        '0':    'Bk',
        '1':    'Bn',
        '2':    'Rd',
        '3':    'Og',
        '4':    'Yw',
        '5':    'Gn',
        '6':    'Bl',
        '7':    'Vt',
        '8':    'Gy',
        '9':    'Wt',
    },
    COLORS_TOLERANCE = {
        '1':    'Bn',
        '2':    'Rd',
        '5':    'Gd',
        '50':   'Sr',
    },
    UI_WATTAGE = {
        '1-8':  '⅛W',
        '1-4':  '¼W',
        '1-2':  '½W',
    };


function X(x) {
    x = Math.min(x, CONFIG.pageWidth - 1);
    x = Math.max(x, 1);
    return x;
}


function Y(y) {
    y = Math.min(y, CONFIG.pageHeight - 1);
    y = Math.max(y, 1);
    return y;
}


function wattageUI(watt) {
    if (! watt) {
        return '';
    }
    if (UI_WATTAGE[watt]) {
        return UI_WATTAGE[watt];
    }
    return parseInt(watt, 10) + 'W';
}


//  val:        short form
//  multPower:  multiplier power
//  mult:       multiplier color
//  digits:     array of digit colors
function envelopeUI(val, config) {
    var ui = {},
        mult = 0,
        bands;

    if (val >= 1000000) {
        ui.val = (val / 1000000) + 'M';
    } else if (val >= 1000) {
        ui.val = (val / 1000) + 'k';
    } else {
        ui.val = val.toString();
    }

    if (val < 100) {
        val *= 1000;
        mult -= 3;
    }
    bands = val.toString().split('');
    mult += bands.length - (config.digits);

    ui.digits = bands.slice(0, config.digits).map(function(d) {
        return COLORS_DIGIT[d.toString()];
    });
    ui.mult = COLORS_MULTIPLIER_POWER[mult.toString()];
    ui.multPower = mult.toString();
    return ui;
}


function resistors(req, res, next) {
    var config = LIBS.qs.parse(req.params.config),
        vals = req.params.values.split(','),
        errs = false,
        tmpl,   // data for the template
        width, center, d;
    tmpl = {
        config: CONFIG,
        digits: [],     // raw indices for easy iteration
        pages:  [],
        // offsets for symbols found in each envelope
        hbars:  { leaf1: { digits:[] }, leaf2: { digits:[] } },
        vbars:  { E: { digits:[] }, W: { digits:[] } },
        boxes:  { digits:[] },
    };
    vals = vals.map(function(val) {
        var matches = val.match(/^(\d+(\.\d+)?)([rkm]?)$/i);
        if (matches) {
            val = parseFloat(matches[1], 10);
            if (matches[3]) {
                matches[3] = matches[3].toLowerCase();
                if ('k' === matches[3]) {
                    val *= 1000;
                }
                if ('m' === matches[3]) {
                    val *= 1000000;
                }
            }
        } else {
            errs = true;
        }
        return val;
    });
    if (errs) {
        res.sendStatus(400);
        return;
    }

    tmpl.config.bands       = parseInt(config.b, 10);
    tmpl.config.digits      = tmpl.config.bands -2;
    tmpl.config.tolerance   = config.t;
    tmpl.config.tol         = COLORS_TOLERANCE[config.t];
    tmpl.config.watt        = wattageUI(config.w);

    for (d = 0; d < tmpl.config.digits; d++) {
        tmpl.digits[d] = d;
    }

    vals = vals.sort(function(a, b) {
        return a - b;
    });
    vals.forEach(function(val, v) {
        var page = Math.floor(v / 6),
            env = {},       // data for just this envelope in the template
            N, E, S, W,
            leaf, name;
        if (! tmpl.pages[page]) {
            tmpl.pages[page] = {
                envelopes:  [],
            };
        }
        env.val = val;
        env.row = Math.floor((v % 6) / 2);
        env.col = v % 2;
        N = env.row         * CONFIG.envelopeHeight;
        E = (env.col + 1)   * CONFIG.envelopeWidth;
        S = (env.row + 1)   * CONFIG.envelopeHeight;
        W = env.col         * CONFIG.envelopeWidth;
        env.N = Y(N);
        env.E = X(E);
        env.S = Y(S);
        env.W = X(W);
        for (leaf = 0; leaf < 3; leaf++) {
            name = 'leaf' + leaf;
            env[name + 'N'] = Y(N + ((leaf + 0) * CONFIG.foldHeight));
            env[name + 'E'] = X(E - CONFIG.foldWidth);
            env[name + 'S'] = Y(N + ((leaf + 1) * CONFIG.foldHeight));
            env[name + 'W'] = X(W + CONFIG.foldWidth);
            env[name + 'cx'] = X((env[name + 'E'] + env[name + 'W']) / 2);
            env[name + 'cy'] = Y((env[name + 'N'] + env[name + 'S']) / 2);
        }
        env.ui = envelopeUI(val, tmpl.config);
        tmpl.pages[page].envelopes.push(env);
    });

    // offsets for vertical bars (relative to leaf E or W)
    width = tmpl.config.bands * (CONFIG.barSize + CONFIG.barPadding);
    if (! tmpl.config.tolerance) {
        width -= (2 * CONFIG.barPadding) + CONFIG.barSize;
    }
    for (d = 0; d < tmpl.config.digits; d++) {
        tmpl.vbars.W.digits[d] = d * (CONFIG.barSize + CONFIG.barPadding);
        tmpl.vbars.E.digits[d] = -1 * tmpl.vbars.W.digits[d] - CONFIG.barSize;
    }
    tmpl.vbars.W.mult = tmpl.config.digits * (CONFIG.barSize + CONFIG.barPadding);
    tmpl.vbars.E.mult = -1 * tmpl.vbars.W.mult - CONFIG.barSize;
    tmpl.vbars.W.tol = width - CONFIG.barSize;
    tmpl.vbars.E.tol = -1 * tmpl.vbars.W.tol - CONFIG.barSize;

    // offsets for horizontal bars (relative to leaf cy)
    // `width` reused from previous calculation
    center = width / 2;
    for (d = 0; d < tmpl.config.digits; d++) {
        tmpl.hbars.leaf1.digits[d] = (-center) + (d * (CONFIG.barSize + CONFIG.barPadding));
        tmpl.hbars.leaf2.digits[d] = -1 * tmpl.hbars.leaf1.digits[d] - CONFIG.barSize;
    }
    tmpl.hbars.leaf1.mult = (-center) + (tmpl.config.digits * (CONFIG.barSize + CONFIG.barPadding));
    tmpl.hbars.leaf2.mult = -1 * tmpl.hbars.leaf1.mult - CONFIG.barSize;
    tmpl.hbars.leaf1.tol = center - CONFIG.barSize;
    tmpl.hbars.leaf2.tol = -1 * tmpl.hbars.leaf1.tol - CONFIG.barSize;

    // offsets for boxes (relative to leaf cx)
    width = tmpl.config.bands * (CONFIG.boxSize + CONFIG.boxPadding);
    if (! tmpl.config.tolerance) {
        width -= (2 * CONFIG.boxPadding) + CONFIG.boxSize;
    }
    center = width / 2;
    for (d = 0; d < tmpl.config.digits; d++) {
        tmpl.boxes.digits[d] = (-center) + (d * (CONFIG.boxSize + CONFIG.boxPadding));
    }
    tmpl.boxes.mult = (-center) + (tmpl.config.digits * (CONFIG.boxSize + CONFIG.boxPadding));
    tmpl.boxes.tol = center - CONFIG.boxSize;

    res.send(TEMPLATES.resistors(tmpl));
}


ME.init = function init(app, config) {
    LIBS.dot.templateSettings.strip = false;    // preserve whitespace
    TEMPLATES.resistors = LIBS.dot.template(LIBS.fs.readFileSync(__dirname + '/resistors.html'));
    app.get('/ee/envelopes/resistors/:config/:values', resistors);
};


