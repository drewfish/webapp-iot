var ME = module.exports;


function sendFile(path) {
    return function (req, res, next) {
        res.sendFile(path, {
            root:       __dirname,
            maxAage:    (24 * 60 * 60 * 1000),  // one day in milliseconds
        }, function(err) {
            if (err) {
                console.error(err.stack);
                res.status(err.status).end();
            }
        });
    }
}


ME.init = function init(app, config) {
    app.get('/ee/envelopes', sendFile('index.html'));
    app.get('/ee/envelopes/resistors/how-to-fold.svg', sendFile('resistors/how-to-fold.svg'));
    require('./resistors').init(app, config);
};


