library sole;

import 'dart:async';
import 'dart:io';
import 'dart:json' as json;
import 'package:postgresql/postgresql.dart' as pg;

part 'sole_session.dart';


main() {
  var port = 8080;
  HttpServer.bind('0.0.0.0', port).then((HttpServer server){
    print('Server started on port: ${port}');
    server.listen(
        handleRequest,
        onError: (e) => print('HttpServer error: $e'),
        onDone: () => print('HttpServer done.'));
  });
}

handleRequest(HttpRequest request) {

	var path = request.uri.path;
	
	// Handle web socket request.
	if (path == '/session') {
		WebSocketTransformer.upgrade(request).then((ws) => new _SoleSession(ws));
		return;
	}

	var safePath;
	if (path.startsWith('/webroot')) {
		var original = path.slice(1);
		safePath = new Path(original).canonicalize().toString();
		if (!safePath.startsWith('webroot') || safePath != original) {
			sendResponse(response, path, 400, 'Bad request');
			return;
		}

	} else {
		safePath = 'webroot/sole.html';
	}

	sendFileSync(request, safePath);
}

sendFileSync(HttpRequest request, String path) {

  var error;
  try {

	  var file = new File(path);
	  var response = request.response;

	  if (!file.existsSync()) {
	  	sendFileNotFound(response, path);
	    return;
	  }

	  if (path.endsWith('.html')) {
	    response.headers.set(HttpHeaders.CONTENT_TYPE, 'text/html');
	  } else if (path.endsWith('.js')) {
	    response.headers.set(HttpHeaders.CONTENT_TYPE, 'text/javascript');
	  } else if (path.endsWith('.css')) {
	    response.headers.set(HttpHeaders.CONTENT_TYPE, 'text/css');
	  }

	  response
	    ..statusCode = 200
	    //..add(file.readAsBytesSync())
	    ..writeBytes(file.readAsBytesSync())
	    ..close();

  } on Exception catch (err) {
  	error = err;  	
  } finally {
  	var code = (error == null) ? 200 : 500;
  	print('$code ${new DateTime.now()} $path');
  	if (error != null)
  		print(error);
  }
}

sendFileNotFound(HttpResponse response, String path) {
	sendResponse(response, path, 404, 'Not found :(');
}

sendResponse(HttpResponse response, String path, int statusCode, String msg) {
	print('$statusCode ${new DateTime.now()} $path');
    response
      ..headers.set(HttpHeaders.CONTENT_TYPE, 'text/plain')
      ..statusCode = statusCode
      //..addString(msg)
      ..writeln(msg)
      ..close();
}