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
        if (isAuthenticated(obj, req, res)) {
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

function isAuthenticated(obj, req, res) {
    // Check if the session expired.
    if ((req.session != null) && (typeof req.session.expire === 'number') && (req.session.expire <= Date.now())) {
        return false;
    }

    const domain = (req.url ? getDomain(req) : getDomain(res));
    // TODO check for blocked user/ip etc.
    if (domain &&
        req.session &&
        (req.session.userid != null) &&
        (req.session.userid.split('/')[1] === domain.id) &&
        (obj.users[req.session.userid])
    ) {
        // This user is logged in using the ExpressJS session
        return true;
    }
    return false;
}

function getDomain(req) {
    if (req.xdomain != null) {
        // Domain already set for this request, return it.
        return req.xdomain;
    }
    if ((req.hostname === 'localhost') && (req.query.domainid != null)) {
        const d = parent.config.domains[req.query.domainid];
        // This is a localhost access with the domainid specified in the URL
        if (d != null) {
            return d;
        }
    }
    if (req.hostname != null) {
        const d = obj.dnsDomains[req.hostname.toLowerCase()];
        // If this is a DNS name domain, return it here.
        if (d != null) {
            return d;
        }
    }
    const x = req.url.split('/');
    if (x.length < 2) {
        return parent.config.domains[''];
    }
    const y = parent.config.domains[x[1].toLowerCase()];
    if ((y != null) && (y.dns == null)) {
        return parent.config.domains[x[1].toLowerCase()];
    }
    return parent.config.domains[''];
}
