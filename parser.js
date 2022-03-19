"use strict"

let regi = []
let types = []
;[
	/\n/, 'newline',
	
	/^#{1,3} /, 'heading',
	/^---+$/, 'line',
	
	/(?:[*][*]|__|~~|[/])(?=\w()|\W|$)/, 'style', 'style_end', 
	
	/[\\](?:{|\w+(?:\[.*?\])?{?)/, 'env',
	/}/, 'env_end',
	/^>(?:\[.*?\])?[{ ]/, 'quote',
	/[\\][^]/, 'escape',
	
	/`.*?`/, 'icode',
	/^```[^]*?^```/, 'code',
	
	/!?(?:https?:[/][/]|sbs:)[-\w./%?&=#+~@:$*',;!)(]*[-\w/%&=#+~@$*';)(](?:\[.*?\])?/, 'link',
	
	/ *[|] *$(?!\n[|])/, 'table_end',
	/ *(?:[|] *\n()|^()|)[|](?:\[.*?\])? */, 'table_row', 'table', 'table_cell',
	
	///^ *- /, 'list',
].forEach(item=>{
	if (item instanceof RegExp)
		regi.push(item.source+"()")
	else
		types.push(item)
})
let r = new RegExp("("+regi.join("|")+")", 'm')
let step = types.length+2

// later we'll leave these as numbers
function check_tag(text, tag, type) {
	return types[type]
}

function lex(text) {
	let tokens = String.prototype.split.call(text, r)
	
	// filter tags
	let list = []
	let bac = ""
	let i;
	for (i=0; i<tokens.length-1; i+=step) {
		let text = tokens[i], tag_text = tokens[i+1]
		let type = tokens.indexOf("", i+2) - (i+2)
		type = check_tag(text, tag_text, type)
		if (type!=null) {
			bac += text
			if (bac)
				list.push([null,bac])
			list.push([type,tag_text])
			bac = ""
		} else {
			bac += text+tag_text
		}
	}
	bac += tokens[i]
	if (bac)
		list.push([null,bac])
	
	return list
}

// text <i> more text </i>

let open = {
	heading: true, style: true, env: true,
	quote: true,
	table: true,
	
}

function prune(tokens) {
	let tree = {type:'ROOT',tag:"",content:[]}
	let current = tree
	
	// start a new block
	function newlevel(token) {
		current = {
			type:token[0],
			tag:token[1],
			content:[],
			parent:current,
		}
	}
	// move up
	function up() {
		let o = current
		current = current.parent
		delete o.parent
		return o
	}
	// add an item to the current level
	function push(...x) {
		current.content.push(...x)
	}
	// complete current block
	function complete() {
		// push the block + move up
		let o = up()
		push(o)
	}
	// cancel current block (flatten)
	function cancel() {
		let o = up()
		// push the start tag (as text)
		push_text(o.tag)
		// push the contents of the block
		push(...o.content)
	}
	// push text
	function push_text(text) {
		push({type: null, content: text})
	}
	// push empty tag
	function push_tag(type) {
		push({type: type, content: null})
	}
	
	for (let token of tokens) {
		let [type,text] = token
		if (type==null) {
			push_text(text)
		} else if (type=='heading') {
			newlevel(token)
		} else if (type=='newline') {
			while (1) {
				if (current.type=='heading')
					complete()
				else if (current.type=='style')
					cancel()
				else
					break
			}
			push_tag(type)
		} else if (type=='line' || type=='icode' || type=='code' || type=='link') {
			push_tag(type)
		} else if (type=='style') {
			newlevel(token)
		} else if (type=='style_end') {
			while (1) {
				if (current.type=='style') {
					if (current.tag == text) {
						complete()
						break
					} else
						cancel()
				} else {
					push_text(text)
					break
				}
			}
		} else if (type=='env') {
			newlevel(token)
		} else if (type=='env_end') {
			while (1) {
				if (current.type=='env') {
					complete()
					break
				} else if (!current.type) { // todo: we need to CHECK if an env is open before starting this loop
					complete()
					break
				} else {
					cancel()
				}
			}
		} else if (type=='escape') {
			push_text(text.substr(1))
		} else if (type=='table') {
			newlevel(['table', ""]) // table
			newlevel(['table_row', ""]) // row
			newlevel(['table_cell', text]) // cell
		} else if (type=='table_cell') {
			while (1) {
				if (current.type=='style') {
					cancel()
				} else if (current.type=='table_cell') {
					complete()
					newlevel(token) // cell
					break
				} else {
					push_text(text)
					break
				}
			}
		} else if (type=='table_row') {
			while (1) {
				if (current.type=='style') {
					cancel()
				} else if (current.type=='table_cell') {
					complete() // cell
					complete() // row
					newlevel(['table_row', ""]) // row
					newlevel(['table_cell', text.split("\n")[1]]) // cell
					break
				} else {
					push_text(text)
					break
				}
			}
		} else if (type=='table_end') {
			while (1) {
				if (current.type=='style') {
					cancel()
				} else if (current.type=='table_cell') {
					complete() // cell
					complete() // row
					complete() // table
					break
				} else {
					push_text(text)
					break
				}
			}
		}
	}
	while (1) {
		if (current.type!='ROOT')
			cancel()
		else
			break
	}
	
	return tree
}

let elems = {
	newline: 'br',
	heading: 'h1',
	line: 'hr',
	style: 'i',
	env: 'b', //todo
	quote: 'blockquote',
	icode: 'code',
	code: 'pre',
	link: 'a',
	table: 'table',
	table_row: 'tr',
	table_cell: 'td'
}

function render(tree) {
	let elem
	if (!tree.type) {
		elem = document.createTextNode(tree.content)
	} else {
		if (tree.type=='ROOT')
			elem = document.createDocumentFragment()
		else
			elem = document.createElement(elems[tree.type])	
		if (tree.content)
			for (let i of tree.content)
				elem.append(render(i))
	}
	return elem
}

///(?<![^\s({'"])[/](?![\s,'"])/
