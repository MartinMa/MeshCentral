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
    obj.app.get(url + 'api/agents', function (req, res) {
        if (isAuthenticated(obj, req, res)) {
            // Read query params.
            let size = parseInt(req.query.size ?? '10', 10);
            let page = parseInt(req.query.page ?? '0', 10);
            // TODO Sorting
            // let sort = req.query.sort ?? 'id';

            // Determine content type.
            res.set({ 'Content-Type': 'application/json' });
            obj.db.GetAllType('node', function(err, docs) {
                if (err != null) {
                    res.status(500);
                    res.send(JSON.stringify({
                        timestamp: new Date().toISOString().replace('Z', '+0000'),
                        status: 500,
                        error: 'Internal Server Error',
                        message: '',
                        path: 'api/agents'
                    }));
                } else {
                    // All elements. We need to apply paging, filtering and sorting manually.
                    let content = Array.isArray(docs) ? docs : [];
                    // TODO Apply filtering, apply sorting.
                    // Total number of elements.
                    let totalElements = content.length;
                    // Total number of pages.
                    let totalPages = Math.ceil(content.length / size);
                    // First page?
                    let first = page === 0 || totalPages < 2;
                    // Last page?
                    let last = page >= (totalPages - 1);
                    // Page number (zero based)
                    let pageNumber = page <= (totalPages - 1) ? page : totalPages - 1;
                    content = content.slice(page * size, page * size + size);
                    res.status(200);
                    res.send(JSON.stringify({
                        empty: content.length === 0 ? true : false,
                        first,
                        last,
                        number: pageNumber,
                        numberOfElements: content.length,
                        size,
                        totalElements,
                        totalPages,
                        content,
                    }));
                }
            });
        } else {
            res.status(403);
            res.send(JSON.stringify({
                timestamp: new Date().toISOString().replace('Z', '+0000'),
                status: 403,
                error: 'Forbidden',
                message: '',
                path: 'api/agents'
            }));
        }
    });
}

function isAuthenticated(obj, req, res) {
    // Check if the session expired.
    if ((req.session != null) && (typeof req.session.expire === 'number') && (req.session.expire <= Date.now())) {
        return false;
    }

    const domain = (req.url ? getDomain(req) : getDomain(res));
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
