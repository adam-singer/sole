part of pginspect_server;

main() {
  int defaultPort = 8080;
  var portStr = Platform.environment['PORT'];
  if (portStr == null)
    portStr = "";
  var port = int.parse(portStr, onError: (_) => defaultPort);
  
  if (!new Directory('webroot').existsSync()) {
    print('Could not find webroot.');
    return;
  }

  HttpServer.bind('0.0.0.0', port).then((HttpServer server){
    print('Server started on port: ${port}');
    server.listen(
        handleRequest,
        onError: (e) => print('Error: $e',
        onDone: () => print('done')));
  });
}

var routes = {
 '/schema': handleSchema
};

void handleRequest(HttpRequest request) {

  var path = request.uri.path;

  // Handle webroot file request.
  //FIXME probably not secure
  if (path.startsWith('/webroot/') && !path.contains('..')) {
    handleWebroot(request);
    return;
  }
  
  var handler = routes[path]; 
  
  if (handler == null) {
    request.response
            ..headers.set(HttpHeaders.CONTENT_TYPE, 'text/plain')
            ..statusCode = 404
            ..addString('Not found :(')
            ..close();
  } else {
  
    pgconnect().then((conn) {
      handler(request, conn).then((_) => conn.close()); 
    }).catchError((error) {
      var msg = 'Boom!\n$error';
      print(msg);
      request.response
      ..headers.set(HttpHeaders.CONTENT_TYPE, 'text/plain')
      ..statusCode = 500
      ..addString('$msg')
      ..close();
    });
  }
}


Future<Connection> pgconnect() {
  
  var username = 'testdb';
  var database = 'testdb';
  var password = 'password';
  var host = 'localhost';
  int port = 5432;
  
  var url = Platform.environment['DATABASE_URL'];

  if (url != null) {    
    var re = new RegExp(r'^postgres://([a-zA-Z0-9\-\_]+)\:([a-zA-Z0-9\-\_]+)\@([a-zA-Z0-9\-\_\.]+)\:([0-9]+)\/([a-zA-Z0-9\-\_]+)');
    var match = re.firstMatch(url);
    if (match != null && match.groupCount == 5) {    
      username = match[1];
      password = match[2];
      host = match[3];
      port = int.parse(match[4], onError: (_) => port);
      database = match[5];
    }
  }

  return connect(username, database, password, host: host, port: port);
}

Future handleSchema(HttpRequest request, Connection conn) {
  return loadSchema(conn).then((json) {    
    print(json);
    request.response
    ..headers.set(HttpHeaders.CONTENT_TYPE, 'text/json')
    ..statusCode = 200
    ..addString(json)
    ..close();
  })
  .catchError((error) {
    var msg = 'Boom!\n$error';
    print(msg);
    request.response
    ..headers.set(HttpHeaders.CONTENT_TYPE, 'text/plain')
    ..statusCode = 500
    ..addString('$msg')
    ..close();
  });
}

handleWebroot(HttpRequest request) {
  var path = request.uri.path;
  var response = request.response;

  print('Request: ${path.slice(1)}');
  var f = new File(path.slice(1));

  if (!f.existsSync()) {
    response
      ..headers.set(HttpHeaders.CONTENT_TYPE, 'text/plain')
      ..statusCode = 404
      ..addString('Not found :(')
      ..close();
    return;
  }   

  if (path.endsWith('.html')) {
    response.headers.set(HttpHeaders.CONTENT_TYPE, 'text/html');
  } else if (path.endsWith('.js')) {
    response.headers.set(HttpHeaders.CONTENT_TYPE, 'text/javascript');
  } else if (path.endsWith('.css')) {
    response.headers.set(HttpHeaders.CONTENT_TYPE, 'text/css');
  }

  //TODO async hotness...
    response
        ..statusCode = 200
        ..add(f.readAsBytesSync())
        ..close();
}

