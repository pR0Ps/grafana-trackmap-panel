module.exports = (grunt) => {
  require('load-grunt-tasks')(grunt);

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.initConfig({

    clean: ['dist'],

    copy: {
      src_to_dist: {
        cwd: 'src',
        expand: true,
        src: ['**/*', '!**/*.js', '!**/*.scss'],
        dest: 'dist/'
      },
      readme: {
        src: ['README.md'],
        dest: 'dist/',
        options: {
          // Remove the 'src/' prefix from any paths so relative links still work
          process: function (content, srcpath) {
            return content.replace(/src\//g, '');
          },
        },
      },
      leaflet: {
        cwd: 'node_modules/leaflet/dist/',
        expand: true,
        src: ['leaflet.js', 'leaflet.css', 'images'],
        dest: 'dist/leaflet/'
      },
      leaflet_img: {
        cwd: 'node_modules/leaflet/dist/images',
        expand: true,
        src: '*',
        dest: 'dist/leaflet/images/'
      }
    },

    watch: {
      rebuild_all: {
        files: ['src/**/*', 'README.md'],
        tasks: ['default'],
        options: {
          spawn: false
        }
      },
    },

    babel: {
      options: {
        sourceMap: true,
        presets: [['@babel/preset-env', {'modules': 'systemjs'}]]
      },
      dist: {
        files: [{
          cwd: 'src',
          expand: true,
          src: ['*.js'],
          dest: 'dist',
          ext: '.js',
        }]
      },
    },

  });

  grunt.registerTask('default', ['clean', 'copy', 'babel']);
};
