var LIBS = {
        async:  require('async'),
        google: require('googleapis'),
        moment: require('moment-timezone'),
    },
    CONFIG,
    TIME_TZ     = 'America/Los_Angeles',
    TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss [GMT]ZZ',
    EVENT_CALENDARS = [
        {
            name: 'gfr mitras & order members',
            ID: 'votlmbd04qtjd4l8to2cfql58g@group.calendar.google.com',
        },
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
        // run in order, later ones take precedence over earlier ones
        { field: 'summary',  regexp: /renter/i,         location: 'ground' },
        { field: 'summary',  regexp: /ground\s+floor/i, location: 'ground' },
        { field: 'summary',  regexp: /annex/i,          location: 'annex' },
        { field: 'location', regexp: /ground/i,         location: 'ground' },
        { field: 'location', regexp: /annex/i,          location: 'annex' },
    ],
    // The google calendar API isn't really oriented to list events which are currently in
    // progress. We'll work around this by loading events which started within the last
    // day, and filter out those which have in fact ended.
    // As well, we want to show events which will be starting soon (within a day).
    EVENT_WINDOW_MS = 86400000,     // how far into the past and future to load events (milliseconds)
    GOOGLEAPI_AUTH_CLIENT;


// make & return the singleton
function getAuthClient(req) {
    if (! GOOGLEAPI_AUTH_CLIENT) {
        GOOGLEAPI_AUTH_CLIENT = new LIBS.google.auth.JWT(
            CONFIG.SFBC_GA_EMAIL,
            __dirname + '/sfbc_ga_key.pem',
            null,
            [ 'https://www.googleapis.com/auth/calendar.readonly' ]
        );
    }
    return GOOGLEAPI_AUTH_CLIENT;
}


// This express middleware will make sure that the auth client has been authorized.
function authorize(req, res, next) {
    var authClient = getAuthClient(req);
    // FUTURE -- no-op if already authorized
    authClient.authorize(function(err, token) {
        if (err) {
            res.status(401);
            res.type('text/plain');
            res.send('authentication failed\n' + err.message);
            return;
        }
        authClient.setCredentials(token);
        next();
    });
}


// show info about current or next event at the ground floor and annex
// first line:  comma-separated fields
//      current time    unix-epoch (long)
//      ground type     0=free, 1=occupied (long)
//      ground time     unix-epoch, start if free, end if occupied (long)
//      annex type      0=free, 1=occupied (long)
//      annex time      unix-epoch, start if free, end if occupied (long)
// the rest:  json
//      {
//          now:                date
//          ground: {
//              free:           boolean
//              start:          date
//              end:            date
//              summary:        text
//              url:            text
//          }
//          annex: {
//              free:           boolean
//              start:          date
//              end:            date
//              summary:        text
//              url:            text
//          }
//      }
function events(req, res, next) {
    var api = LIBS.google.calendar('v3'),
        authClient = getAuthClient(req),
        now = Date.now(),
        events = [];

    LIBS.async.each(EVENT_CALENDARS, function(cal, calDone) {
        var params = {};
        params.auth = authClient;
        params.calendarId = cal.ID;
        params.orderBy = 'startTime';
        params.timeMin = (new Date(now - EVENT_WINDOW_MS)).toISOString();
        params.timeMax = (new Date(now + EVENT_WINDOW_MS)).toISOString();
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
                // we'll store all our additions to the event in this object
                event.sfbc = {};
                event.sfbc.location = location;
            });
            events = events.concat(body.items);
            calDone();
        });
    }, function(err) {
        var locations = {},     // location: array of events
            csv = [],
            json = {},
            now = Date.now();   // update, since API calls might have taken some time
        if (err) {
            res.status(500);
            res.send(err);
            return;
        }
        events.forEach(function(event) {
            if (! event.sfbc.location) {
                return;
            }
            if (!event.start.dateTime || !event.end.dateTime || event.status !== 'confirmed') {
                return;
            }
            event.sfbc.start = new Date(event.start.dateTime);
            event.sfbc.end = new Date(event.end.dateTime);
            if (event.sfbc.end.getTime() < now) {
                // event has already ended
                return;
            }
            if (! locations[event.sfbc.location]) {
                locations[event.sfbc.location] = [];
            }
            locations[event.sfbc.location].push(event);
        });
        csv.push(Math.floor(now / 1000));
        json.now = LIBS.moment(now).tz(TIME_TZ).format(TIME_FORMAT);
        ['ground', 'annex'].forEach(function(location) {
            var events = locations[location] || [],
                event;
            events = events.sort(function(a, b) {
                return a.sfbc.start.getTime() - b.sfbc.start.getTime();
            });
            /*DEBUGGING
            console.log(location);
            events.forEach(function(event) {
                console.log(event.sfbc.start.toString(), '--', event.sfbc.end.toString(), '--', event.summary);
            });
            */
            event = events[0];
            if (! event) {
                csv.push(0);
                csv.push(0);
                json[location] = {
                    free: true,
                    start: 0,
                    end: 0,
                    summary: '',
                    url: '',
                };
                return;
            }
            if (now < event.sfbc.start.getTime()) {
                csv.push(0);
                csv.push(Math.floor(event.sfbc.start.getTime() / 1000));
                json[location] = {
                    free:       true,
                    start:      LIBS.moment(event.sfbc.start).tz(TIME_TZ).format(TIME_FORMAT),
                    end:        LIBS.moment(event.sfbc.end).tz(TIME_TZ).format(TIME_FORMAT),
                    summary:    event.summary || '',
                    url:        event.htmlLink || '',
                };
            } else {
                csv.push(1);
                csv.push(Math.floor(event.sfbc.end.getTime() / 1000));
                json[location] = {
                    free:       true,
                    start:      LIBS.moment(event.sfbc.start).tz(TIME_TZ).format(TIME_FORMAT),
                    end:        LIBS.moment(event.sfbc.end).tz(TIME_TZ).format(TIME_FORMAT),
                    summary:    event.summary || '',
                    url:        event.htmlLink || '',
                };
            }
        });
        res.status(200);
        res.type('text/plain');
        res.send(csv.join(',') + '\n' + JSON.stringify(json, null, 4) + '\n');
    });
}


module.exports.init = function init(app, config) {
    CONFIG = config;
    app.get('/sfbc/events', authorize, events);
};


