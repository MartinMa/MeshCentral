/**
* @description MeshCentral
* @license Apache-2.0
* @version v0.0.1
*/

/*jslint node: true */
/*jshint node: true */
/*jshint strict:false */
/*jshint -W097 */
/*jshint esversion: 6 */
"use strict";

module.exports.CreateCustomEndpoints = function (url, obj) {
    // Add custom endpoints here
    obj.app.get(url + 'custom', function (req, res) {
        if (isAuthenticated(obj, req)) {
            res.status(200);
            res.set({ 'Content-Type': 'application/json' });
            res.send(JSON.stringify({ 'hey': 10 }));
        } else {
            res.status(403);
            res.set({ 'Content-Type': 'application/json' });
            res.send(JSON.stringify({ 'Forbidden': true }));
        }
    });
}

function isAuthenticated(obj, req) {
    // Check if the session expired.
    if ((req.session != null) && (typeof req.session.expire === 'number') && (req.session.expire <= Date.now())) {
        return false;
    }

    if (req.session && (req.session.userid != null) && (req.session.userid.split('/')[1] === domain.id) && (obj.users[req.session.userid])) {
        // This user is logged in using the ExpressJS session
        return true;
    }
    return false;
}
