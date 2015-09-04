

var LIBS = {
        express:    require('express'),
    },
    HANDLERS = {
        sfbc:       require('./handlers/sfbc.js'),
    },
    CONFIG = require('./config.js');


function main(args) {
    var app = LIBS.express();
    app.set('port', (process.env.PORT || 5000));
    app.use(function(req, res, next) {
        console.log('----------------------------------------', req.url);
        next();
    });
    HANDLERS.sfbc.init(app, CONFIG);
    app.listen(app.get('port'), function() {
          console.log('listening on port', app.get('port'));
    });

}
main(process.argv.slice(2));


