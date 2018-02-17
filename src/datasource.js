import _ from "lodash";

export class GenericDatasource {

    constructor(instanceSettings, $q, backendSrv, templateSrv) {
        this.type = instanceSettings.type;
        this.url = instanceSettings.url;
        this.name = instanceSettings.name;
        this.q = $q;
        this.backendSrv = backendSrv;
        this.templateSrv = templateSrv;
        this.withCredentials = instanceSettings.withCredentials;
        this.headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        const jsonData = instanceSettings.jsonData || {};

        if (jsonData.useAuthToken && typeof jsonData.authToken === 'string') {
            this.headers['Authorization'] = `Bearer ${jsonData.authToken}`;
        } else if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
            this.headers['Authorization'] = instanceSettings.basicAuth;
        }
    }

    query(options) {
        console.log(options);
        var query = this.buildQueryParameters(options);
        query.targets = query.targets
                .filter(t => !t.hide)
                .filter(t => t.type === 'timeserie');

        if (query.targets.length <= 0) {
            return Promise.resolve({data: []});
        }
        
        const xids = query.targets.map(t => t.target);
        
        const requestBody = {
            //dateTimeFormat: 'yyyy-MM-dd\'T\'HH:mm:ss.SSSXXX',
            from: options.range.from.toISOString(),
            to: options.range.to.toISOString(),
            //timezone: options.range.from.tz(),
            xids
        };
        
        if (options.maxDataPoints) {
            requestBody.limit = options.maxDataPoints;
        }

        return this.doRequest({
            url: this.url + '/rest/v1/point-values/multiple-points-multiple-arrays',
            data: requestBody || null,
            method: 'POST'
        }).then(response => {
            return Object.keys(response.data).map(xid => {
                const pointValues = response.data[xid].map(val => {
                    return [val.value, val.timestamp];
                });
                return {
                    target: xid,
                    datapoints: pointValues
                };
            });
        }).then((data) => {
            return {data};
        });
    }

    testDatasource() {
        return this.doRequest({
            url: this.url + '/rest/v1/users/current',
            method: 'GET',
        }).then(response => {
            const user = response.data;
            return {
                status: 'success',
                message: `Data source is working, authenticated as ${user.username}`,
                title: 'Success'
            };
        });
    }

    annotationQuery(options) {
        var query = this.templateSrv.replace(options.annotation.query, {}, 'glob');
        var annotationQuery = {
                range: options.range,
                annotation: {
                    name: options.annotation.name,
                    datasource: options.annotation.datasource,
                    enable: options.annotation.enable,
                    iconColor: options.annotation.iconColor,
                    query: query
                },
                rangeRaw: options.rangeRaw
        };

        return this.doRequest({
            url: this.url + '/annotations',
            method: 'POST',
            data: annotationQuery
        }).then(result => {
            return result.data;
        });
    }

    metricFindQuery(query) {
        console.log(query);
        var interpolated = {
            target: this.templateSrv.replace(query, null, 'regex')
        };
        console.log(interpolated);
        
        const url = [];
        const queryParts = [];
        if (query) {
            queryParts.push(`name=like=${query}*`);
        }
        queryParts.push('limit(20)');

        return this.doRequest({
            url: `${this.url}/rest/v2/data-points?${queryParts.join('&')}`,
            method: 'GET',
        }).then(response => {
            const points = response.data.items;
            return points.map(pt => {
                return {
                    text: pt.name,
                    value: pt.xid
                }
            });
        });
    }

    doRequest(options) {
        options.withCredentials = this.withCredentials;
        options.headers = this.headers;

        return this.backendSrv.datasourceRequest(options);
    }

    buildQueryParameters(options) {
        //remove placeholder targets
        options.targets = _.filter(options.targets, target => {
            return target.target !== 'select metric';
        });

        var targets = _.map(options.targets, target => {
            return {
                target: this.templateSrv.replace(target.target, options.scopedVars, 'regex'),
                refId: target.refId,
                hide: target.hide,
                type: target.type || 'timeserie'
            };
        });

        options.targets = targets;

        return options;
    }
}
