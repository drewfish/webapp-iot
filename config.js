// Loads configuration variables, from the heroku settings (which are env vars)
// or from local.json. Since these config vars contain sensitive info they are
// not checked in -- neither the heroku settings nor local.json.


var DEFAULTS = {
        'SFBC_CLIENT_ID': '',
        'SFBC_CLIENT_SECRET': '',
        'SFBC_GA_EMAIL': '',
    },
    LOCAL = {};


try {
    // since local.json isn't checked into git it doesn't exist in the app
    // deployed to heroku
    LOCAL = require('./local.json');
} catch (err) {
    LOCAL = {};
}


Object.keys(DEFAULTS).forEach(function(key) {
    module.exports[key] = process.env[key] || LOCAL[key] || DEFAULTS[key];
});


