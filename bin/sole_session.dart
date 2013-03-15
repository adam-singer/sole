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
			} else {
				print('Received: $data');
			}

			if (jsonObj['type'] == 'connect') {
				if (jsonObj['uri'] == null || !(jsonObj['uri'] is String)) {
					throw Ex();
				}

				_remote.connect(jsonObj['uri'])
				  .then((_) => _send({'type': 'connected', 'uri': jsonObj['uri']}))
				  .catchError((e) {
				  	_sendError('Connect failed: $e');
				  	_send({'type': 'closed'});
				  });
			
			} else if (jsonObj['type'] == 'close') {

				_remote.close();
				_send({'type': 'closed'});

			} else if (jsonObj['type'] == 'query') {
				if (jsonObj['sql'] == null || !(jsonObj['sql'] is String))
					throw Ex();

				bool firstRow = true;

				_remote.query(jsonObj['sql']).listen(
					(row) {
						if (firstRow) {
							firstRow = false;
							var columns = new List();
							row.forEach((k, _) => columns.add(k));							
							_send({'type': 'row-header', 'columns': columns});
						}

						var values = new List();
						row.forEach((_, v) => values.add(v));
						_send({'type': 'row', 'data': values});
					},
					onError: (e) => _sendError('Query error: $e'),
					onDone: () => _send({'type': 'query-complete'}));

			} else if (jsonObj['type'] == 'load-schema') {

				_remote.loadSchema()
				  .then((schema) => _send({'type': 'schema', 'schema': schema}))
				  .catchError((e) => _sendError('Load schema failed: $e'));

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
		print('Send error: $msg');
		_socket.send(json.stringify({'type': 'error', 'msg': msg}));
	}

	_send(Object msg) {
		var s = json.stringify(msg);
		print('Sent: $s');
		_socket.send(s);
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

	Future loadSchema() {
		if (_conn == null)
			return new Future.immediateError('Not connected.');

		final sqlDbName = 'select catalog_name from information_schema.information_schema_catalog_name';

		final sqlColumns = r'''
select
	table_schema,
	table_name,
	column_name,
	ordinal_position,
	column_default,
	is_nullable,
	data_type,
	character_maximum_length,
	numeric_precision,
	numeric_scale,
	numeric_precision_radix
from information_schema.columns
where table_schema not in ('information_schema', 'pg_catalog')
order by table_schema, table_name, ordinal_position;
''';

		var db = new Database();

		// Could be set to null while the queries are running so make a local copy.
		var c = _conn;

		// First lookup database name
		return c.query(sqlDbName).single
			.then((r) => db.name = r.catalog_name)
			.then((_) {
				// Then lookup schemas, tables, columns
				return c.query(sqlColumns).toList().then((list) {
					var schema;
					var table;
					for (var row in list) {
						if (schema == null || schema.name != row.table_schema) {
							schema = new Schema()..name = row.table_schema;
							db.schemas.add(schema);
						}

						if (table == null || table.name != row.table_name) {
							table = new Table()..name = row.table_name;
							schema.tables.add(table);
						}
						
						table.columns.add(new Column()
							..name = row.column_name); //TODO add other properties.
					}
				});
			})
			.then((_) {
				return db.toJson();
			});
	}
}

class Database {
	String name;
	List<Schema> schemas = new List<Schema>();
	toJson() => {'name': name, 'schemas': schemas.map((v) => v.toJson()).toList()};
}

class Schema {
	String name;
	List<Table> tables = new List<Table>();
	toJson() => {'name': name, 'tables': tables.map((v) => v.toJson()).toList()};
}

class Table {
	String name;
	List<Column> columns = new List<Column>();
	toJson() => {'name': name, 'columns': columns.map((v) => v.toJson()).toList()};
}

class Column {
	String name;
	//bool isNullable; etc...
	toJson() => {'name': name};

	/*
	ordinal_position,
	column_default,
	is_nullable,
	data_type,
	character_maximum_length,
	numeric_precision,
	numeric_scale,
	numeric_precision_radix
	*/
}