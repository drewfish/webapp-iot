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
            defaultLocation: 'ground',
        },
        {
            name: 'mitras & order members',
            ID: 'j5185kft94igqlrmph9sdncn0g@group.calendar.google.com',
        },
        {
            name: 'main',
            ID: 'sfbuddhistcenter@gmail.com',
            defaultLocation: 'ground',
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
        { field: 'summary',  regexp: /ground\s+floor/i, location: 'ground' },
        { field: 'summary',  regexp: /renter/i,         location: 'ground' },
        { field: 'summary',  regexp: /annex/i,          location: 'annex' },
        { field: 'location', regexp: /annex/i,          location: 'annex' },
    ],
    // The google calendar API isn't really oriented to list events which are currently in
    // progress. We'll work around this by loading events which started within the last
    // day, and filter out those which have in fact ended.
    // As well, we want to show events which will be starting soon.
    EVENT_WINDOW            = 86400,    // how far into the past and future to load events (seconds)
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
        GOOGLEAPI_AUTH_CLIENT = new LIBS.google.auth.OAuth2(
            GOOGLEAPI_CLIENT_ID,
            GOOGLEAPI_CLIENT_SECRET,
            'http://' + req.headers.host + '/sfbc/google-auth'
        );
    }
    return GOOGLEAPI_AUTH_CLIENT;
}


// one comma-separated line of fields
//      current time    unix-epoch (long)
//      ground type     0=free, 1=occupied (long)
//      ground time     unix-epoch, start if free, end if occupied (long)
//      annex type      0=free, 1=occupied (long)
//      annex time      unix-epoch, start if free, end if occupied (long)
function events(req, res, next) {
    var api = LIBS.google.calendar('v3'),
        authClient = getAuthClient(req),
        now = Date.now();
    authClient.getAccessToken(function(err, token) {
        var events = [];
        if (! token) {
            console.log('REDIRECTING', '/sfbc/google-auth');
            res.redirect('/sfbc/google-auth');
            return;
        }
        LIBS.async.each(EVENT_CALENDARS, function(cal, calDone) {
            var params = {};
            params.auth = authClient;
            params.calendarId = cal.ID;
            params.orderBy = 'startTime';
            params.timeMin = (new Date(now - (1000 * EVENT_WINDOW))).toISOString();
            params.timeMax = (new Date(now + (1000 * EVENT_WINDOW))).toISOString();
            params.singleEvents = true;
            api.events.list(params, function(err, body) {
                if (err) {
                    calDone(err);
                    return;
                }
                body.items.forEach(function(event) {
                    var location = cal.defaultLocation;
                    EVENT_FILTERS.forEach(function(filter) {
                        var val = event[filter.field];
                        if (val && val.match(filter.regexp)) {
                            location = filter.location;
                        }
                    });
                    event.sfbc = {};
                    event.sfbc.location = location;
                });
                events = events.concat(body.items);
                calDone();
            });
        }, function(err) {
            var locations = {}, // location: array of events
                fields = [],
                now = Date.now();
            if (err) {
                res.status(500);
                res.send(err);
                return;
            }
            events.forEach(function(event) {
                var start, end;
                if (! event.sfbc.location) {
                    return;
                }
                if (!event.start.dateTime || !event.end.dateTime || event.status !== 'confirmed') {
                    return;
                }
                event.sfbc.start = new Date(event.start.dateTime);
                event.sfbc.end = new Date(event.end.dateTime);
                if (event.sfbc.end.getTime() < now) {
                    return;
                }
                if (! locations[event.sfbc.location]) {
                    locations[event.sfbc.location] = [];
                }
                locations[event.sfbc.location].push(event);
            });
            fields.push(Math.floor(now / 1000));
            ['ground', 'annex'].forEach(function(location) {
                var events = locations[location] || [],
                    event;
                events = events.sort(function(a, b) {
                    return a.sfbc.start.getTime() - b.sfbc.start.getTime();
                });
                /*DEBUGGING
                console.log();
                console.log(location);
                events.forEach(function(event) {
                    console.log(event.sfbc.start, '--', event.sfbc.end, '--', event.summary);
                });
                */
                event = events[0];
                if (! event) {
                    fields.push(0);
                    fields.push(0);
                    return;
                }
                if (now < event.sfbc.end.getTime()) {
                    fields.push(1);
                    fields.push(Math.floor(event.sfbc.end.getTime() / 1000));
                } else {
                    fields.push(0);
                    fields.push(Math.floor(event.sfbc.start.getTime() / 1000));
                }
            });
            res.status(200);
            res.type('text/plain');
            res.send(fields.join(',') + '\n');
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


