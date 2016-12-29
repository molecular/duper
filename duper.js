var fs = require('fs');
var _ = require('lodash');
var crypto = require('crypto');
var fs_extra = require('fs-extra');

const hash_sampling_percent = 0.2; // what percentage of files to sample when hashing (100 = no sampling)
const dry_run = false;

function adddir( path, progress_callback, progress ) {
	//console.log("adddir( " + path + " )" );
	if ( progress === undefined ) progress = [];
	var files = fs.readdirSync( path );
	var my_progress = {
		current: 0,
		count: files.length
	}
	progress.push( my_progress );

	files.forEach( (f) => {
		my_progress.current += 1;
		progress_callback( progress );
		var file = path + '/' + f;
		var stats = fs.lstatSync( file );
		if ( stats.isFile() ) {
			addfile( file );
		}
		if ( stats.isDirectory() ) {
			adddir( file, progress_callback, progress );
		}
	})

	progress.pop();
}

var by_size = {}
function addfile( file ) {
	var stats = fs.lstatSync( file );
	var id = "size_" + stats.size;
	if ( by_size[id] === undefined ) by_size[id] = [];
	by_size[id].push( file );
}

function calc_hash( file ) {
	var shasum = crypto.createHash( 'sha256' );
	var stats = fs.lstatSync( file );
	if ( hash_sampling_percent == 100 || stats.size < 1024*1024 ) {
		shasum.update( fs.readFileSync( file ) );
	} else {
		const blocksize = 8192;
		var buffer = new Buffer( blocksize );
		var block_count = stats.size / blocksize;
		var loop_count = block_count * (hash_sampling_percent / 100);
		var block_space = block_count / loop_count;
		//console.log("file size", stats.size, "block_count", block_count, "loop_count", loop_count, "block_space", block_space);
		var fd = fs.openSync( file, 'r' );
		for (var i=0; i<loop_count; i+=1) {
			var start = ( block_space * i ) * blocksize;
			fs.readSync( fd, buffer, 0, blocksize, start );
			shasum.update( buffer );
		}
		fs.closeSync( fd );
	}
	return shasum.digest( 'hex' );
}

var by_hash = {}
function addfile_by_hash( file, progress_callback ) {
	var hash = calc_hash( file );

	if ( by_hash[hash] === undefined ) by_hash[hash] = [];
	by_hash[hash].push( file );

	progress_callback( _.keys( by_hash ).length );
}

function remove_files( base_path, destination, files ) {
	files.forEach( (file) => {
		var dest_file = file.replace( base_path, destination + '/' );
		var dest_dir = dest_file.split('/').slice(0, -1).join('/');
		if ( dry_run ) {
			console.log("dry_run", file, " => ", dest_file);
		} else {
			fs_extra.mkdirpSync( dest_dir );
			fs.renameSync( file, dest_file );
		}
	});
	console.log('moved', files.length, 'files to "' + dest_dir + '" including directory structure')
}
// ---

console.log("welcome to duper.js: find and delete duplicate (by content) files\n");
console.log("\
usage:\n\tduper.js <directory> [<substring>:<preference>]*\n\n\
with\n\
	<directory> \tthe folder to scan for duplicates\n\
	<substring> \tstring to use for matching filename (incl. path)\n\
	<preference> \t[keep|delete] the action to preferrably take if filename (incl. path) matches <substring>\n\
how it works:\n\n\
	see README.md\n\
");

// parse cmdline args

var dir = process.argv[2];
if ( dir === undefined ) dir = '.';

var prefs = 
_.map( 
	_.takeRightWhile( process.argv, (a) => {
		return a.indexOf(':') >= 0
	}), (p) => {
		return {
			substring: p.split( ':' )[0],
			preference: p.split( ':' )[1]
		}
	}
);

// scan filesystem recursively, clustering files by size into global by_size

console.log( '\nscanning filesystem...' );
var progress_count = 0;
adddir( dir, (progress) => {
	progress_count += 1;
	if ( progress_count % 50 == 0 ) {
		var pstr = _.map( progress, (p) => {
			return "" + p.current + '/' + p.count;
		}).join( ' ' );
		process.stdout.write( 'scanning progress: ' + pstr + '                                                                                          \r');
	}
});

// filter clusters having more than 1 file

dupes_by_size = _.filter( by_size, (entry) => {
	return entry.length > 1;
});
console.log('found', _.keys( dupes_by_size ).length, 'clusters by size match' );

// hash the duplicate files, clustering by file hash

console.log( '\ncalculating file hashes of file in equally-sized clusters... (using ' + hash_sampling_percent + '% content sampling)' );
var flat_dupes = _.flattenDeep( dupes_by_size );
flat_dupes.forEach( (file) => {
	addfile_by_hash( file, (count) => {
		process.stdout.write( 'hashing progress: ' + count + ' of ' + flat_dupes.length + '\r');
	});
});
process.stdout.write('\n\n');

// filter clusters having more than 1 entry

//console.log("by_hash", by_hash);

var dupes_by_hash = _.filter( by_hash, (entry) => {
	return entry.length > 1;
});

console.log('found', _.keys( dupes_by_hash ).length, 'clusters by hash match' );

console.log("dupes_by_hash", dupes_by_hash);

// select all except one file per cluster to delete

var deletion_list = _.map( dupes_by_hash, ( cluster ) => {
	//console.log('\n------ checking cluster: ', cluster );

	// map files in each cluster to actions by matching preference substring to filename 
	var actions = {
		'delete': [],
		'keep': []
	};

	_.forEach( cluster, (file) => {
		// find first matching preference
		var matching_pref = _.filter( prefs, (pref) => {
			return file.indexOf( pref.substring ) >= 0;
		})[0];
		if ( matching_pref ) {
			actions[matching_pref.preference].push( file );
		}
	})

	// add more items ot 'delete' action until all except one are added
	var quantity_to_add = _.keys(cluster).length - actions['delete'].length - 1
	if ( quantity_to_add > 0 ) {
		// determine array of files neither in 'delete' nor 'keep' (those can be added to 'delete')
		var unmatched = _.filter( cluster, (file) => {
			return (
				actions['delete'].indexOf( file ) == -1 &&
				actions['keep'].indexOf( file ) == -1 
			);
		});
		var additional_delete = unmatched.slice( 0, quantity_to_add)
		actions['delete'] = actions['delete'].concat( additional_delete );
		// add the remainder of the unmatched files to 'keep'
		actions['keep'] = actions['keep'].concat( unmatched.slice( quantity_to_add ) );
		// since we made a decision (without using a rule) about which file to delete,
		// we try to achieve some consistency regarding this selection in the future
		// by adding preferences generated from differences between the names of
		// the selected (for deletion) and the non-selected files
		var keep_tokens = _.reduce( actions['keep'], (result, file) => {
			return result.concat( file.split(/[^\w]/) );
		}, []);
		var selected_file_tokens = _.reduce( additional_delete, (result, file) => {
			return result.concat( file.split(/[^\w]/) );
		}, []);
		var delete_tokens = _.difference( selected_file_tokens, keep_tokens );
		// add the identifying tokens as substrings for delete preferences
		delete_tokens.forEach( (token) => {
			if (
				_.map( prefs, ( pref ) => {
					return pref.substring;
				}).indexOf( token ) == -1
			) {
				prefs.push({
					substring: token,
					preference: 'delete'
				});
			}
		});
	}
	// return files mapped to 'delete' action (but not too many)
	return actions['delete'].slice( 0, _.keys(cluster).length - 1 ); 
});
deletion_list = _.flatten( deletion_list );

console.log("final prefs: ", _.reduce( prefs, (a, p) => { return a + " " + p.substring + ':' + p.preference; }, ""));

//console.log( "will delete the following files:\n" + deletion_list.join('\n') );
console.log("deletion_list", deletion_list);
console.log("(", deletion_list.length, "files )");

var dest_dir = dir.split('/').slice(0, -1).join('/') + '/removed_by_duper(' + dir.split('/').slice(-1)[0] + ')';
remove_files( dir, dest_dir, deletion_list );
console.log("", deletion_list.length, "files have been moved to", dest_dir);