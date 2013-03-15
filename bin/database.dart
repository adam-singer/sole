part of pginspect_server;

class Database {
  String name;
  List<Schema> schemas;
}

class Schema {
  String name;
  List<Table> tables;
}

class Table {
  String name;
  List<Column> columns;
}

class Column {
  String name;
}

// Make a json object describing the current database schema.
Future<String> loadSchema(Connection conn) {
  return new Future.immediate('{"oi": "you!"}');
}

