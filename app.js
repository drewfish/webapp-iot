var LIBS = {
        express:    require('express'),
    },
    HANDLERS = {
        ee:     require('./handlers/ee'),
        sfbc:   require('./handlers/sfbc'),
    },
    CONFIG = require('./config.js');


function main() {
    var app = LIBS.express();
    app.set('port', CONFIG.PORT);
    app.use(function(req, res, next) {
        console.log('----------------------------------------', req.url);
        next();
    });
    HANDLERS.ee.init(app, CONFIG);
    HANDLERS.sfbc.init(app, CONFIG);
    app.listen(app.get('port'), function() {
          console.log('listening on port', app.get('port'));
    });

}
main();


