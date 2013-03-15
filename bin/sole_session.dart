part of sole;

class _SoleSession {
	final WebSocket _socket;
	final _SoleRemoteApi _remote = new _SoleRemoteApi();
	//StreamSubscription _subs;


	_SoleSession(this._socket) {
		//_subs =
		_socket.listen(_handleData, onError: _handleError, onDone: _handleDone);
	}

	_handleData(data) {

		try {
			Ex() => new Exception('Received invalid message from client: $data');

			if (data is List<int>) {
				throw Ex();
			}

			var jsonObj;
			try {
				jsonObj = json.parse(data);
			} on FormatException catch (ex) {
				throw Ex();
			}

			if (jsonObj == null || !(jsonObj is Map) || jsonObj['type'] == null) {
				throw Ex();
			
			} else if (jsonObj['type'] == 'connect') {
				if (jsonObj['uri'] == null || !(jsonObj['uri'] is String)) {
					throw Ex();
				}

				_remote.connect(jsonObj['uri'])
				  .then((_) => _send({'type': 'connected', 'uri': jsonObj['uri']}))
				  .catchError((e) => _sendError('Connect failed: $e'));
			
			} else if (jsonObj['type'] == 'close') {

				_remote.close();
				_send({'type': 'closed'});

			} else if (jsonObj['type'] == 'query') {
				if (jsonObj['sql'] == null || !(jsonObj['sql'] is String))
					throw Ex();

				_remote.query(jsonObj['sql']).listen(
					(row) {
						var values = new List();
						row.forEach((_, v) => values.add(v));					
						_send({'type': 'row', 'data': values});
					},
					onError: (e) => _sendError('Query error: $e'),
					onDone: () => _send({'type': 'query-complete'}));

			} else {
				throw Ex();
			}
		} on Exception catch (ex) {
			print('Error: $ex');
			_socket.close();			
		}
	}

	_handleTextData(String data) {
		print('Text data received: $data');
		_socket.send('Echo: $data');
	}

	_handleError(error) {
		print('Websocket error: $error');
	}

	_handleDone() {
		print('Websocket closed.');
	}

	_sendError(String msg) {
		_socket.send(json.stringify({'type': 'error', 'msg': msg}));
	}

	_send(Object msg) {
		_socket.send(json.stringify(msg));
	}
}

class _SoleRemoteApi {
	pg.Connection _conn;

	Future connect(String uri) {
		var username, password, host, port, database;

		var re = new RegExp(r'^postgres://([a-zA-Z0-9\-\_]+)\:([a-zA-Z0-9\-\_]+)\@([a-zA-Z0-9\-\_\.]+)\:([0-9]+)\/([a-zA-Z0-9\-\_]+)');
	    var match = re.firstMatch(uri);
	    if (match != null && match.groupCount == 5) {    
	      username = match[1];
	      password = match[2];
	      host = match[3];
	      port = int.parse(match[4], onError: (_) => port);
	      database = match[5];
	    } else {
	    	return new Future.immediateError('Invalid connection uri.');
	    }

	    if (_conn != null)
	    	close();

	    return pg.connect(username, database, password, host: host, port: port)
	      .then((c) { 
	      	_conn = c;
	      });
	}

	void close() {
		_conn.close();
		_conn = null;
	}

	Stream query(String sql) {
		if (_conn == null) {
			return new StreamController()
				..signalError('No current connection.')
				.stream;
		}

		return _conn.query(sql);
	}

	Future<Map> schema() {
		return new Future.immediateError('Not implemented.');
	}
}
