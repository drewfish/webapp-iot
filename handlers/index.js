require('fs').readdirSync(__dirname).forEach(function(path) {
    if ('.js' === path.slice(-3) && 'index.js' !== path) {
        module.exports[path.slice(0, -3)] = require(__dirname + '/' + path);
    }
});
