module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    copy: [{
      expand: true,
      cwd: 'src/html',
      src: ['**/*'],
      dest: 'build/'
    }],
    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n',
        sourceMap: true,
        mangle: {
          // sort: true, // disabled since grunt-contrib-uglify v0.2.1
          toplevel: true,
          eval: true
        }
      },
      files: {
        src: 'build/<%= pkg.name %>.js',
        dest: 'build/<%= pkg.name %>.min.js'
      }
    },
    browserify: {
      files: {
        src: 'src/init.js',
        dest: 'build/<%= pkg.name %>.js'
      }
    },
    markdown: {
      all: {
        files: [
          {
            expand: true,
            cwd: 'src/html',
            src: ['**/*.md'],
            dest: 'build/',
            ext: '.html'
          }
        ]
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-markdown');

  grunt.registerTask('default', ['copy', 'browserify', 'uglify', 'markdown']);
};
