window.onload = init;

function query(q) {
	return document.querySelector(q);
}

function init() {

	var soleClient;

    CodeMirror.commands.autocomplete = function(cm) {
        CodeMirror.showHint(cm, CodeMirror.sqlHint);
    };

    var editor = CodeMirror(query('#editor'), {
        value: '',
        extraKeys: {"Ctrl-Space": "autocomplete"},
        mode: 'text/x-sql',
        indentWithTabs: true,
        smartIndent: true,
        lineNumbers: false,
        matchBrackets : true,
        autofocus: true
    });

    function runQuery() {

    	var sql = editor.getValue();		

    	var el = document.createElement('div');
    	el.className = "query";
    	el.appendChild(query('#editor .CodeMirror').cloneNode(true));
    	query('#history').appendChild(el);
		
		var resultElement = document.createElement('div');
    	resultElement.className = "result";
    	query('#history').appendChild(resultElement);
    	
    	showQueryingIcon(resultElement);

    	// Wait for query to complete - before doing this?
    	// Perhaps hide it until query has completed.
    	editor.setValue('');
    	query('#editor').scrollIntoView(false);
    	editor.focus();

    	soleClient.query(
    		sql,
    		function(err) {
    			hideQueryingIcon(resultElement);
    			addError(resultElement, err);
    		},
    		function() { hideQueryingIcon(resultElement); },
    		function(columns) { resultTable = createResultTable(resultElement, columns); },
    		function(row) { addRow(resultTable, row); });
    }

    function showQueryingIcon(resultElement) {
    	var querying = document.createElement('div');
    	querying.className = "querying";
    	resultElement.appendChild(querying);
    	query('#history').appendChild(resultElement);
    }

    function hideQueryingIcon(resultElement) {
    	var el = resultElement.firstChild;
    	if (el.className == 'querying')
    		resultElement.removeChild(el);
    }

    function createResultTable(resultElement, columnNames) {
		var table = document.createElement('table');
		var tr = document.createElement('tr');
		table.appendChild(tr);
		for (var i = 0, name; name = columnNames[i]; i++) {
			var th = document.createElement('th');
			tr.appendChild(th);
			th.appendChild(document.createTextNode(name));			
		}

		resultElement.appendChild(table);

		return table;
    }

    function addRow(table, row) {
    	var tr = document.createElement('tr');
		table.appendChild(tr);
		for (var i = 0; i < row.length; i++) {
			var td = document.createElement('td');
			tr.appendChild(td);
			td.appendChild(document.createTextNode(row[i]));			
		}
    }

    function addError(resultElement, msg) {
    	var el = document.createElement('div');
    	el.className = "error";
    	el.appendChild(document.createTextNode(msg));
    	resultElement.appendChild(el);
    }

    // Listen for ctrl-enter
    window.addEventListener('keypress', function(e) {
    	if (e.ctrlKey && e.keyCode == 10) {
    		runQuery();
    	}
    }, false);

    var postgresUri = 'postgres://testdb:password@localhost:5432/testdb';
    var soleWebSocketUri = 'ws://localhost:8080/session';

    postgresUri = window.prompt('PostgreSQL URI', postgresUri);

    SoleClient.startSession(
    	soleWebSocketUri,
    	function(err) { alert(err); },
    	function(client) {
		    client.connect(
		    	postgresUri,
		    	function(err) { alert(msg); },
		    	function() {		    		
		    		soleClient = client;
		    		updateCompletion(soleClient);
		    	});
   		});
};

function updateCompletion(soleClient) {

	function update(db) {
		var names = [];
		names.push(db.name);
		for (var i = 0, schema; schema = db.schemas[i]; i++) {
			names.push(schema.name);
			for (var j = 0, table; table = schema.tables[j]; j++) {
				names.push(table.name);
				for (var k = 0, col; col = table.columns[k]; k++) {
					names.push(col.name);
				}
			}
		}
		CodeMirror.setSqlCompletions(names);

		alert('connected');
	}

	soleClient.loadSchema(
		function(err) { alert(err); },
		update);
}

// Dont use this, use SoleClient.startSession().
function SoleClient(ws) {
	this.state = 'WEB_SOCKET_CONNECTED';
	this.ws = ws;
	this.dbUri = null;
	this.errorCallback = null;
	this.connectDoneCallback = null;
	this.queryRowCallback = null;
	this.queryRowHeaderCallback = null;
	this.queryDoneCallback = null;
	this.schemaDoneCallback = null;

	var scope = this;

	this.ws.onclosed = function() {
		scope.state = 'WEB_SOCKET_CLOSED';
		console.log(this.state);
	};

	this.ws.onerror = function(err) {
		console.log('Web socket error.', err);
		scope.ws.close();
		scope.state = 'WEB_SOCKET_CLOSED';
	};

	this.ws.onmessage = function(event) {
		console.log(event);
		var msg;
		var errmsg = 'Invalid websocket message received.';
		if (event != null && event.data != null) {
			try {
				msg = JSON.parse(event.data);
			} catch (ex) {
				console.error(errmsg, event.data);
				return;
			}
		}

		if (msg == null || msg.type == null) {
			console.error(errmsg, event.data);
			return;
		}

		if (msg.type == 'error') {
			var cb = scope.errorCallback;
			scope._clearCallbacks();
			if (cb)
				cb(msg.msg);			
			return;
		}

		if (scope.state == 'WEB_SOCKET_CONNECTED' && msg.type == 'connected') {
			scope.dbUri = msg.uri;
			scope.state = 'DB_CONNECTED';
			var cb = scope.connectDoneCallback;
			scope._clearCallbacks();
			if (cb)
				cb();
			return;
		}

		if (scope.state == 'DB_CONNECTED' && msg.type == 'closed') {
			scope.dbUri = null;
			scope.state = 'WEB_SOCKET_CONNECTED';
			var cb = scope.errorCallback; 
			scope._clearCallbacks();
			if (cb)
				cb('Connection closed.');
			return;
		}

		if (scope.state != 'DB_CONNECTED' || msg.type == 'closed' || msg.type == 'connected') {
			console.error('Message type: ' + msg.type + ' received in invalid state: ' + scope.state);
			return;
		}

		if (msg.type == 'row-header') {
			if (scope.queryRowHeaderCallback)
				scope.queryRowHeaderCallback(msg.columns);
		} else if (msg.type == 'row') {
			if (scope.queryRowCallback)
				scope.queryRowCallback(msg.data);
		} else if (msg.type == 'query-complete') {
			var cb = scope.queryDoneCallback;
			scope._clearCallbacks();
			if (cb)
				cb(); //TODO pass rows affected.
		} else if (msg.type == 'schema') {
			var cb = scope.schemaDoneCallback;
			scope._clearCallbacks();
			if (cb)
				cb(msg.schema);
		} else {
			console.error('Unknown message type: ' + msg.type);
		}
	};
}

// uri: 'ws://localhost:8080/session'
SoleClient.startSession = function(uri, errorCallback, doneCallback) {
	var ws = new WebSocket(uri, ['pginspect']);
	ws.onopen = function() {
		ws.onerror = null;
		doneCallback(new SoleClient(ws));		
	};
	ws.onerror = function(err) {
		console.error(err);
		errorCallback(err);
	};
}

// i.e. 'postgres://testdb:password@localhost:5432/testdb'
//TODO hookup callback.
SoleClient.prototype.connect = function(uri, errorCallback, doneCallback) {
	this._clearCallbacks();	
	this.errorCallback = errorCallback;
	this.connectDoneCallback = doneCallback;
	this._send({'type': 'connect', 'uri': uri});
};

SoleClient.prototype.close = function() {
	if (this.errorCallback)
		this.errorCallback('Connection closed.');
	this._clearCallbacks();
	this._send({'type': 'close'});
};

SoleClient.prototype.query = function(sql, errorCallback, doneCallback, rowHeaderCallback, rowCallback) {
	this._clearCallbacks();	
	this.errorCallback = errorCallback;
	this.queryDoneCallback = doneCallback;
	this.queryRowHeaderCallback = rowHeaderCallback;
	this.queryRowCallback = rowCallback;
	this._send({'type': 'query', 'sql': sql});
};

SoleClient.prototype.loadSchema = function(errorCallback, doneCallback) {
	this._clearCallbacks();	
	this.errorCallback = errorCallback;
	this.schemaDoneCallback = doneCallback;
	this._send({'type': 'load-schema'});
};

SoleClient.prototype._send = function(msg) {
	console.log('Send message: ', msg);
	this.ws.send(JSON.stringify(msg));
};

SoleClient.prototype._clearCallbacks = function() {
	this.errorCallback = null;
	this.connectDoneCallback = null;
	this.queryRowCallback = null;
	this.queryRowHeaderCallback = null;
	this.queryDoneCallback = null;
	this.schemaDoneCallback = null;
};