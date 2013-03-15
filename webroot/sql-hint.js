(function() {

	var Pos = CodeMirror.Pos;
	var prefixHash = null;

	var sqlTransactions = "begin rollback transaction".split(" ");
	var sqlKeywords = "alter and as asc between by count create delete desc distinct drop from having in insert into is join like not on or order select set table union update values where".split(" ");
	var sqlTypes = "bool boolean bit blob enum long longblob longtext medium mediumblob mediumint mediumtext time timestamp tinyblob tinyint tinytext text bigint int int1 int2 int3 int4 int8 integer float float4 float8 double char varbinary varchar varcharacter precision real date datetime year unsigned signed decimal numeric".split(" ");

	var words = sqlTransactions.concat(sqlKeywords).concat(sqlTypes);

	CodeMirror.sqlHint = function(editor, options) {
		return scriptHint(editor,
	                      function (e, cur) {return e.getTokenAt(cur);},
	                      options);
	};

	CodeMirror.setSqlCompletions = function(list) {
		prefixHash = buildPrefixHash(list.concat(words));
	};

	function scriptHint(editor, getToken, options) {		

		if (!prefixHash)
			CodeMirror.setSqlCompletions([]);

		var cur = editor.getCursor();
		var token = getToken(editor, cur);
		var start = token.start;
		var end = token.end;

		var prefix = token.string.toLowerCase();

		var completions = prefixHash[prefix];

		if (completions == null || completions.length == 0)
			completions = words;

	    return {list: completions,
        		from: Pos(cur.line, start),
        		to: Pos(cur.line, end)};
	}
  
	function buildPrefixHash(list) {
		var hash = {};
		for (var i = 0, word; word = list[i]; i++) {
			var prefix = "";
			for (var c = 0; c < word.length; c++) {
				prefix += word[c];
				if (!hash[prefix])
					hash[prefix] = [];
				hash[prefix].push(word);
			}
		}
		return hash;
	}

})();