# duper

finds duplicate files (based on content) and moves them elsewhere for manual review / deletion

## installation / dependencies

 * nodejs

sorry, no package.json at this point, TODO. Will need some stuff you can install using npm, like 

 * fs-extra
 * crypto
 * lodash

## usage

```
#> node duper.js <directory> [<substring>:<preference>]*

with

        <directory>     the folder to scan for duplicates
        <substring>     string to use for matching filename (incl. path)
        <preference>    [keep|delete] the action to take if filename (incl. path) matches <substring>

```

## what it does

Duper roughly follows the following steps:

 * **scan**: recursively scan the given `<directory>`, clustering files with identical content
 * **select**: for each cluster of *n* identical files, select *n-1* files for removal
 * **removal**: remove the selected files (currently the files will be moved to a separate directory for review / deletion)

## how it works

### scan

Identifying files with identical content is done in 2 steps:

 * cluster files by their size
 * for clusters with more than 1 file, cluster files by their sha256 hash

To speed up hashing, there is an option to sample only a percentage of the content. It's called "hash_sampling_percent" and can be adjusted in duper.js

### selection

When a cluster of identical files is identified, the goal is to select (for removal) all but one of them. To select the correct one can be quite a challenge and is sensitive to the use-case.

Because of this, duper can be given a set of rules of the following form:

```
<substring>:<preference>
```

> Note: you can use Duper without specifying any rules.

#### rule-matching

The sequence of those rules is relevant: for each file in a cluster, duper will find the first rule *matching* the given file. A rule matches when the file's name (including the full path) contains `<substring>'. The file is added to a set of files related by the `<preference>` of the matching rule. 

At this point there are 3 sets of files per cluster:

  * **'delete'**: files whose first matching rule has `<preference> = 'delete'`
  * **'keep'**: files whose first matching rule has `<preference> = 'keep'`
  * **unmatched**: files with no matching rule

#### handling unmatched files

In case the 'delete'-set already contains *n - 1* files, we're done here and the 'delete'-set is the set of files to be removed.

Otherwise we need to add more files from the unmatched-set. 

> Note: files from the 'keep'-set are never removed. This means that files matching a rule with `<preference> == 'keep'` are protected from removal.

### removal

In case the variable `dry_run` is true, instead of actually doing anything, duper will log information of what *would* be done to stdout and do nothing.

Otherwise duper actually modifies your filesystem. Files are not deleted, however, but moved to a different location. This destination directory will be created by duper and called `removed_by_duper(<n>)` where <n> is the name of the `<directory>` supplied on the commandline. It will be placed on the same level as <n>. Files are moved *including* their directory structure (starting from `<directory>`)

## examples

TODO

## caveats

`<directory>` must contain at least one slash and cannot be '/'. This is due to the way destination directory for removed files is determined. I suggest using an absolute path.

## troubleshooting / faq

### but, but,... I'm afraid to run it, will it delete files I want to keep?

yes and no: duper might very well *select* some files you don't want deleted for removal. However, duper will not actually delete the files, but move them to another location (sibling to the `<directory>` you supplied). This way you can manually recover those files, move them back and (if adequate) rerun duper with a different set of rules.

### calculating hashes is slow

yes. The complete content of the file needs to be read from drive and hashed. To alleviate this you can change "hash_sampling_percent" to something low, like 0.2 or 1. This will change the hashing algorithm to only hash the content partially. This should speed things up greatly. Unfortunately the speedup isn't as large as expected on a magnetic disc drive, likely due to seek latency.

Also, this makes an assumption that might not be true: if x percent of the content of two files are identical, the files are identical. So, use your own judgement.

## outlook / improvement

Duper was developed as a quick project to solve a very specific problem I had. There are many more related use-cases that could be integrated rather easily.

Integrating more use-cases would benefit from use of a cmdline options/arguments parser.

Here's a short, unsorted list of user-cases / todos

 * use some cmdline parser, the following parameters are already implemented and should be adjustable by cmdline args:
   * dryrun
   * hash_sampling_percent
 * a probably common use-case is "import" of fresh files into some existing collection.
 * currently, *all* files are checked. Some pre-filtering could be appropriate.
 * partial content hashing ("hash_sampling_percent") isn't as effective as expected. some research might be adequate.
 * limiting rule-matching to only the path/filename ans simple substring matching is probably inadequate for many use-cases

## outro

thanks for using, please feedback, fork, pull-request