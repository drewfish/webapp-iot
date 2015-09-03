var LIBS = {
        async:      require('async'),
        google:     require('googleapis'),
        request:    require('request'),
        qs:         require('querystring'),
    },
    EVENT_CALENDARS = [
//      {
//          name: 'gfr mitras & order members',
//          ID: 'votlmbd04qtjd4l8to2cfql58g@group.calendar.google.com',
//      },
        {
            name: 'intro',
            ID: 't23afoktcn9olosu3mv2qh7u28@group.calendar.google.com',
            defaultLocation: '1stfloor',
        },
        {
            name: 'mitras & order members',
            ID: 'j5185kft94igqlrmph9sdncn0g@group.calendar.google.com',
        },
        {
            name: 'main',
            ID: 'sfbuddhistcenter@gmail.com',
            defaultLocation: '1stfloor',
        },
        {
            name: 'meetings',
            ID: 'saslh29jvr285povsn1ckb3k0g@group.calendar.google.com',
        },
        {
            name: 'order members',
            ID: 'thj0vjc1aiamakmihl9n3o04dk@group.calendar.google.com',
        },
    ],
    EVENT_FILTERS = [
        { field: 'summary',  regexp: /ground\s+floor/i, location: '1stfloor' },
        { field: 'summary',  regexp: /renter/i,         location: '1stfloor' },
        { field: 'summary',  regexp: /annex/i,          location: 'annex' },
        { field: 'location', regexp: /annex/i,          location: 'annex' },
    ],
    // The google calendar API isn't really oriented to list events which are currently in
    // progress. We'll work around this by loading events which started within the last
    // day, and filter out those which have in fact ended.
    // As well, we want to show events which will be starting soon.
    EVENT_WINDOW_BACKWARD   = 86400,    // how far ito the past to load events (seconds)
    EVENT_WINDOW_FORWARD    = 3600,     // how far into the future to load events (seconds)
    GOOGLEAPI_CLIENT_ID     = process.env.SFBC_CLIENT_ID,
    GOOGLEAPI_CLIENT_SECRET = process.env.SFBC_CLIENT_SECRET,
    GOOGLEAPI_AUTH_CLIENT;


function getAuthClient(req) {
    var local;
    if (! GOOGLEAPI_AUTH_CLIENT) {
        if (! GOOGLEAPI_CLIENT_ID) {
            local = require('../local.json');
            GOOGLEAPI_CLIENT_ID     = local.SFBC_CLIENT_ID;
            GOOGLEAPI_CLIENT_SECRET = local.SFBC_CLIENT_SECRET;
        }
        //var secrets = require('../client_secret.json');
        GOOGLEAPI_AUTH_CLIENT = new LIBS.google.auth.OAuth2(
            //secrets.installed.client_id,
            //secrets.installed.client_secret,
            GOOGLEAPI_CLIENT_ID,
            GOOGLEAPI_CLIENT_SECRET,
            'http://' + req.headers.host + '/sfbc/google-auth'
        );
    }
    return GOOGLEAPI_AUTH_CLIENT;
}


// one comma-separated line of fields
//      current time    unix-epoch (long)
//      1stfloor        event-status (long)
//      annex           event-status (long)
// event-status:
//      0 if no event
//      1 if event currently in progress
//      otherwise, unix-epoch when the event starts
function events(req, res, next) {
    var api = LIBS.google.calendar('v3'),
        authClient = getAuthClient(req);
    authClient.getAccessToken(function(err, token) {
        var params = {};
        if (! token) {
            console.log('REDIRECTING', '/sfbc/google-auth');
            res.redirect('/sfbc/google-auth');
            return;
        }
        params.auth = authClient;
        params.calendarId = 't23afoktcn9olosu3mv2qh7u28@group.calendar.google.com';
        params.orderBy = 'startTime';
        params.timeMin = (new Date()).toISOString();
        params.singleEvents = true;
        params.maxResults = 3;
        api.events.list(params, function(err, body) {
            res.status(200);
            res.json(body);
        });
    });
}


function googleAuth(req, res, next) {
    var authClient = getAuthClient(req),
        url;
    if (req.query.code) {
        authClient.getToken(req.query.code, function(err, token) {
            if (err) {
                res.status(500);
                res.send(err);
                return;
            }
            authClient.credentials = token;
            console.log('REDIRECTING', '/sfbc/events');
            res.redirect('/sfbc/events');
        });
        return;
    }
    authClient.getAccessToken(function(err, token) {
        if (token) {
            console.log('REDIRECTING', '/sfbc/events');
            res.redirect('/sfbc/events');
            return;
        }
        url = authClient.generateAuthUrl({
            access_type: 'offline',
            scope: 'https://www.googleapis.com/auth/calendar.readonly',
        });
        console.log('REDIRECTING', url);
        res.redirect(url);
    });
}


module.exports.init = function init(app) {
    app.get('/sfbc/events', events);
    app.get('/sfbc/google-auth', googleAuth);
};


