var ME = module.exports;


function index(req, res, next) {
    res.sendFile('index.html', {
        root:       __dirname,
//TODO  maxAage:    (24 * 60 * 60 * 1000),  // one day in milliseconds
    }, function(err) {
        if (err) {
            console.error(err.stack);
            res.status(err.status).end();
        }
    });
}


ME.init = function init(app, config) {
    app.get('/ee/envelopes', index);
    require('./resistors').init(app, config);
};


