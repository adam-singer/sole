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
    	el.appendChild(query('#editor .CodeMirror').cloneNode(true));
    	query('#history').appendChild(el);
    	editor.setValue('');
    	query('#editor').scrollIntoView(false);
    	editor.focus();

    	soleClient.query(
    		sql,
    		function(err) { alert(err); },
    		function() { console.log('Done!'); },
    		function(row) { console.log(row); });
    }

    // Listen for ctrl-enter
    window.addEventListener('keypress', function(e) {
    	if (e.ctrlKey && e.keyCode == 10) {
    		runQuery();
    	}
    }, false);

    var postgresUri = 'postgres://testdb:password@localhost:5432/testdb';
    var soleWebSocketUri = 'ws://localhost:8080/session';

    SoleClient.startSession(
    	soleWebSocketUri,
    	function(err) { alert(err); },
    	function(client) {
		    client.connect(
		    	postgresUri,
		    	function(err) { alert(msg); },
		    	function() {
		    		alert('connected');
		    		soleClient = client;
		    	});
   		});

    //TODO Load database schema
    CodeMirror.setSqlCompletions(["greg_was_here"]);
};

// Dont use this, use SoleClient.startSession().
function SoleClient(ws) {
	this.state = 'WEB_SOCKET_CONNECTED';
	this.ws = ws;
	this.dbUri = null;
	this.errorCallback = null;
	this.connectDoneCallback = null;
	this.queryRowCallback = null;
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
			console.error(msg.msg);
			alert(msg.msg);
			if (scope.errorCallback)
				scope.errorCallback(msg.msg);
			scope._clearCallbacks();
			return;
		}

		if (scope.state == 'WEB_SOCKET_CONNECTED' && msg.type == 'connected') {
			scope.dbUri = msg.uri;
			scope.state = 'DB_CONNECTED';
			if (scope.connectDoneCallback)
				scope.connectDoneCallback();
			scope._clearCallbacks();
			return;
		}

		if (scope.state == 'DB_CONNECTED' && msg.type == 'closed') {
			scope.dbUri = null;
			scope.state = 'WEB_SOCKET_CONNECTED';
			if (scope.errorCallback)
				scope.errorCallback('Connection closed.');
			scope._clearCallbacks();
			return;
		}

		if (scope.state != 'DB_CONNECTED' || msg.type == 'closed' || msg.type == 'connected') {
			console.error('Message type: ' + msg.type + ' received in invalid state: ' + scope.state);
			return;
		}

		if (msg.type == 'row') {
			if (scope.queryRowCallback)
				scope.queryRowCallback(msg.data);
		} else if (msg.type == 'query-complete') {
			if (scope.queryDoneCallback)
				scope.queryDoneCallback();
			scope._clearCallbacks();
		} else if (msg.type == 'schema') {
			if (scope.schemaDoneCallback)
				scope.schemaDoneCallback();
			scope._clearCallbacks();
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

SoleClient.prototype.query = function(sql, errorCallback, doneCallback, rowCallback) {
	this._clearCallbacks();	
	this.errorCallback = errorCallback;
	this.queryDoneCallback = doneCallback;
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
	this.queryDoneCallback = null;
	this.schemaDoneCallback = null;
};