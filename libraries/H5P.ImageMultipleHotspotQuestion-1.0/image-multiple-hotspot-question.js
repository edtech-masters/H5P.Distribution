/*global H5P*/
H5P.ImageMultipleHotspotQuestion = (function ($, Question) {

  /**
   * Initialize module.
   *
   * @class H5P.ImageMultipleHotspotQuestion
   * @extends H5P.Question
   * @param {Object} params Behavior settings
   * @param {number} id Content identification
   * @param {Object} contentData Task specific content data
   */
  function ImageMultipleHotspotQuestion(params, id, contentData) {
    var self = this;

    var defaults = {
      imageMultipleHotspotQuestion: {
        backgroundImageSettings: {
          backgroundImage: {
            path: ''
          }
        },
        hotspotSettings: {
          hotspot: []
        }
      },
      behaviour: {
        enableSubmitAnswer: false,
        enableRetry: false,
        ignoreScoring: false,
        enableSubmitAnswerFeedback: false,
        submissionButtonsAlignment: 'left',
        answerType: 'multi',
        noOfAnswerSelectionAllowed: -1
      },
      submitAnswerFeedback: 'Your answer has been submitted!',
      submitAnswer: 'Submit',
      retryAnswer: 'Retry'
    };

    // Inheritance
    Question.call(self, 'image-hotspot-question');

    /**
     * Keeps track of content id.
     * @type {number}
     */
    this.contentId = id;

    /**
     * Keeps track of current score.
     * @type {number}
     */
    this.score = 0;

    /**
     * Keeps track of max score.
     * @type {number}
     */
    this.maxScore = 1;

    /**
     * Keeps track of parameters
     */
    this.params = $.extend(true, {}, defaults, params);

    /**
     * Easier access to image settings.
     */
    this.imageSettings = this.params.imageMultipleHotspotQuestion.backgroundImageSettings.backgroundImage;

    /**
     * Easier access to hotspot settings.
     */
    this.hotspotSettings = this.params.imageMultipleHotspotQuestion.hotspotSettings;

    /**
     * Hotspot feedback object. Contains hotspot feedback specific parameters.
     * @type {Object}
     */
    this.hotspotFeedback = {
      hotspotChosen: false
    };

    /**
     * Keeps track of all the selected correct hotspots in an array.
     * @type {Array}
     */
    this.correctHotspotFeedback = [];

    /**
     * Keeps track of all correct hotspots in an array.
     * @type {Array}
     */
    this.$hotspots = [];

    /**
     * Keeps track of all correct hotspots in an array.
     * @type {Array}
     */
    this.$allHotspots = [];

    /**
     * Keep track of selected hotspots
     */
    this.selectedHotspots = [];

    /**
     * Hotspots reference
     */
    this.allHotspots = this.hotspotSettings.hotspot;

    /**
     * Keeps track of the content data. Specifically the previous state.
     * @type {Object}
     */
    this.contentData = contentData;
    if (contentData !== undefined && contentData.previousState !== undefined) {
      this.previousState = contentData.previousState;
    }

    // Register resize listener with h5p
    this.on('resize', this.resize);

    /**
     * Overrides the attach method of the superclass (H5P.Question) and calls it
     * at the same time. (equivalent to super.attach($container)).
     * This is necessary, as Ractive needs to be initialized with an existing DOM
     * element. DOM elements are created in H5P.Question.attach, so initializing
     * Ractive in registerDomElements doesn't work.
     */
    this.attach = ((original) => {
      return ($container) => {
        original($container);
        this.wrapper = $container;
        if(this.params.behaviour.submissionButtonsAlignment === 'right') {
          const h5pQuestionButtons = $container.find('.h5p-question-buttons');
          if(h5pQuestionButtons) {
            h5pQuestionButtons.addClass('right-align');
          }
        }
      }
    })(this.attach);
  }


  // Inheritance
  ImageMultipleHotspotQuestion.prototype = Object.create(Question.prototype);
  ImageMultipleHotspotQuestion.prototype.constructor = ImageMultipleHotspotQuestion;

  /**
   * Registers this question types DOM elements before they are attached.
   * Called from H5P.Question.
   */
  ImageMultipleHotspotQuestion.prototype.registerDomElements = function () {
    // Register task introduction text
    if (this.hotspotSettings.taskDescription) {
      this.setIntroduction(this.hotspotSettings.taskDescription);
    }

    // Register task content area
    this.setContent(this.createContent());

    // Register retry button
    if (this.params.behaviour.enableRetry) {
      this.createRetryButton();
      this.hideButton('retry-button');
    }

    // Register submit button
    this.createSubmitButton();
  };

  /**
   * Create wrapper and main content for question.
   * @returns {H5P.jQuery} Wrapper
   */
  ImageMultipleHotspotQuestion.prototype.createContent = function () {
    var self = this;

    this.$wrapper = $('<div>', {
      'class': 'image-hotspot-question ' + this.contentId
    }).ready(function () {
      if(self.$wrapper && self.$wrapper.width !== undefined) {
      var imageHeight = self.$wrapper.width() * (self.imageSettings.height / self.imageSettings.width);
      self.$wrapper.css('height', imageHeight + 'px');
      }
    });

    this.$imageWrapper = $('<div>', {
      'class': 'image-wrapper'
    }).appendTo(this.$wrapper);

    // Image loader screen
    var $loader = $('<div>', {
      'class': 'image-loader'
    }).appendTo(this.$imageWrapper)
    .addClass('loading');

    this.$img = $('<img>', {
      'class': 'hotspot-image',
      'src': H5P.getPath(this.imageSettings.path, this.contentId)
    });

    // Resize image once loaded
    this.$img.on('load', function () {
      $loader.replaceWith(self.$img);
      self.trigger('resize');
    });

    this.attachHotspots();
    this.initImageClickListener();

    /** Check if user has set number of correct hotspots needed, if number of hotspots
     * needed is greater than number of hotspots in image, default to hotspots length.
     */
    if (this.hotspotSettings.numberHotspots && this.hotspotSettings.numberHotspots <= this.$hotspots.length) {
      this.maxScore = this.hotspotSettings.numberHotspots;
    }
    else {
      this.maxScore = this.$hotspots.length;
    }
    return this.$wrapper;
  };

  /**
   * Initiate image click listener to capture clicks outside of defined hotspots.
   */
  ImageMultipleHotspotQuestion.prototype.initImageClickListener = function () {
    var self = this;

    this.$imageWrapper.click(function (mouseEvent) {
      if($(mouseEvent.target).is('.correct, .already-selected, .incorrect')) {
        $(".image-hotspot").each(function() {
          // check if clicked point (taken from event) is inside element
          var mouseX = mouseEvent.pageX;
          var mouseY = mouseEvent.pageY;
          var offset = $(this).offset();
          var width = $(this).width();
          var height = $(this).height();

          if (mouseX > offset.left && mouseX < offset.left+width && mouseY > offset.top && mouseY < offset.top+height) {
            var e = new jQuery.Event("click");
            e.pageX = mouseX;
            e.pageY = mouseY;
            $(this).trigger(e); // force click event
          }
        });
      }
      else {
        // Create new hotspot feedback
        self.createHotspotFeedback($(this), mouseEvent);
      }
    });
  };

  /**
   * Attaches all hotspots.
   */
  ImageMultipleHotspotQuestion.prototype.attachHotspots = function () {
    var self = this;
    this.hotspotSettings.hotspot.forEach(function (hotspot, index) {
      self.attachHotspot(hotspot, index);
    });
  };

  /**
   * Attach single hotspot.
   * @param {Object} hotspot Hotspot parameters
   */
  ImageMultipleHotspotQuestion.prototype.attachHotspot = function (hotspot, index) {
    var self = this;
    var $hotspot = $('<div>', {
      'class': 'image-hotspot ' + hotspot.computedSettings.figure
    }).css({
      left: hotspot.computedSettings.x + '%',
      top: hotspot.computedSettings.y + '%',
      width: hotspot.computedSettings.width + '%',
      height: hotspot.computedSettings.height + '%'
    }).click(function (mouseEvent) {

      if(self.params.behaviour.enableSubmitAnswer) {
        // only select max allowed answers
        if( self.params.behaviour.answerType === 'multi'
            && self.params.behaviour.noOfAnswerSelectionAllowed !== -1
            && ( self.selectedHotspots.length >= self.params.behaviour.noOfAnswerSelectionAllowed
                && !$(this).hasClass('highlight-hotspot'))) {
          return;
        }
        self.highlightHotSpot($(this));
      }

      if ($(this).hasClass("highlight-hotspot") && self.selectedHotspots.indexOf(index) === -1) {
        self.selectedHotspots.push(index); // add chosen hotspot to selectedHotspots list
      } else {
        var itemIndex = self.selectedHotspots.indexOf(index);
        if (itemIndex !== -1) {
          self.selectedHotspots.splice(itemIndex, 1);
        }
      }
      // Create new hotspot feedback
      self.createHotspotFeedback($(this), mouseEvent, hotspot);

      // Do not propagate
      return false;

    }).appendTo(this.$imageWrapper);

    if (hotspot.userSettings.correct) {
      this.$hotspots.push($hotspot);
    }

    this.$allHotspots.push($hotspot)
  };

  ImageMultipleHotspotQuestion.prototype.highlightHotSpot = function (hotspot) {
    if (this.params.behaviour.answerType === 'single') {
      this.resetHighlightHotSpot();
    }
    hotspot.toggleClass('highlight-hotspot');
  };

  ImageMultipleHotspotQuestion.prototype.resetHighlightHotSpot = function () {
    const hotspots = this.wrapper.find('.image-hotspot');
    if (hotspots) {
      hotspots.each(function () {
        if ($(this).hasClass("highlight-hotspot")) {
          $(this).toggleClass('highlight-hotspot');
        }
      });
    }
  }

  /**
   * Create a feedback element for a click.
   * @param {H5P.jQuery} $clickedElement The element that was clicked, a hotspot or the image wrapper.
   * @param {Object} mouseEvent Mouse event containing mouse offsets within clicked element.
   * @param {Object} hotspot Hotspot parameters.
   */
  ImageMultipleHotspotQuestion.prototype.createHotspotFeedback = function ($clickedElement, mouseEvent, hotspot) {

    var feedbackText;

    if (this.hotspotFeedback.$element && this.hotspotFeedback.incorrect) {
      this.hotspotFeedback.$element.remove();
    }

    this.hotspotFeedback = {
      hotspotChosen: false
    };

    // Do not create new hotspot if reached max score
    if (this.score === this.maxScore) {
      return;
    }

    this.hotspotFeedback.$element = $('<div>', {
      'class': 'hotspot-feedback'
    }).appendTo(this.$imageWrapper);

    this.hotspotFeedback.hotspotChosen = true;

    var feedbackPosX;
    var feedbackPosY;

    if($(mouseEvent.target).hasClass('hotspot-feedback')) {
      feedbackPosX = mouseEvent.pageX - $(mouseEvent.currentTarget).offset().left;
      feedbackPosY = mouseEvent.pageY - $(mouseEvent.currentTarget).offset().top;
    }
    else {
      // Center hotspot feedback on mouse click with fallback for firefox
      feedbackPosX = (mouseEvent.offsetX || mouseEvent.pageX - $(mouseEvent.target).offset().left);
      feedbackPosY = (mouseEvent.offsetY || mouseEvent.pageY - $(mouseEvent.target).offset().top);
    }

    // Apply clicked element offset if click was not in wrapper
    if (!$clickedElement.hasClass('image-wrapper')) {
      feedbackPosX += $clickedElement.position().left;
      feedbackPosY += $clickedElement.position().top;
    }

    // Keep position and pixel offsets for resizing
    this.hotspotFeedback.percentagePosX = feedbackPosX / (this.$imageWrapper.width() / 100);
    this.hotspotFeedback.percentagePosY = feedbackPosY / (this.$imageWrapper.height() / 100);
    this.hotspotFeedback.pixelOffsetX = (this.hotspotFeedback.$element.width() / 2);
    this.hotspotFeedback.pixelOffsetY = (this.hotspotFeedback.$element.height() / 2);

    // Position feedback
    this.resizeHotspotFeedback();

    // Style correct answers
    if (hotspot && hotspot.userSettings.correct && !hotspot.userSettings.selected) {
      hotspot.userSettings.selected = true;
      this.hotspotFeedback.$element.addClass('correct');
      this.score = this.score + 1;
      this.correctHotspotFeedback.push(this.hotspotFeedback);
      if (hotspot && hotspot.userSettings.feedbackText) {
        if (this.params.imageMultipleHotspotQuestion.hotspotSettings.hotspotName) {
          feedbackText = (this.params.imageMultipleHotspotQuestion.hotspotSettings.hotspotName ? hotspot.userSettings.feedbackText+' '+this.score+' of '+this.maxScore+' '+this.params.imageMultipleHotspotQuestion.hotspotSettings.hotspotName+'.' : hotspot.userSettings.feedbackText+' '+this.score+' of '+this.maxScore+'.');
        }
      }
      this.hotspotFeedback.incorrect = false;
    }
    else if (hotspot && hotspot.userSettings.selected) {
      this.hotspotFeedback.$element.addClass('already-selected');
      feedbackText = this.params.imageMultipleHotspotQuestion.hotspotSettings.alreadySelectedFeedback;
      this.hotspotFeedback.incorrect = true;
    }
    else if (hotspot) {
      this.hotspotFeedback.$element.addClass('incorrect');
      feedbackText = hotspot.userSettings.feedbackText;
      this.hotspotFeedback.incorrect = true;
    }
    else {
      feedbackText = this.params.imageMultipleHotspotQuestion.hotspotSettings.noneSelectedFeedback;
      this.hotspotFeedback.incorrect = true;
    }
    if (!feedbackText) {
      feedbackText = '&nbsp;';
    }

    this.hotspotFeedback.$element.css({'display':'none'});

    if(this.showScoreFeedback()) {
      this.setFeedback(feedbackText, this.score, this.maxScore);
      this.hotspotFeedback.$element.css({'display':'block'});
    }

    // Finally add fade in animation to hotspot feedback
    this.hotspotFeedback.$element.addClass('fade-in');

    // Trigger xAPI completed event
    this.triggerXAPIScored(this.getScore(), this.getMaxScore(), 'answered', this.maxScore === this.getScore());
  };

  /**
   * show score feedback
   * @returns {boolean}
   */
  ImageMultipleHotspotQuestion.prototype.showScoreFeedback = function () {
    return !this.params.behaviour.ignoreScoring;
  }

  /**
   * Create retry button and add it to button bar.
   */
  ImageMultipleHotspotQuestion.prototype.createRetryButton = function () {
    var self = this;

    this.addButton('retry-button', self.params.retryAnswer, function () {
      self.resetTask();
    }, self.params.behaviour.enableRetry);
  };

  /**
   * Create retry button and add it to button bar.
   */
  ImageMultipleHotspotQuestion.prototype.createSubmitButton = function () {
    var self = this;

    this.addButton('submit-answer', self.params.submitAnswer, function () {
      self.hideButton('submit-answer');
      self.showButton('retry-button');
      if(self.params.behaviour.enableSubmitAnswerFeedback) {
        var $submit_message = `<div class="submit-answer-feedback">${self.params.submitAnswerFeedback}</div>`;
        self.wrapper.find('.h5p-question-content').append($submit_message);
      }
    }, self.params.behaviour.enableSubmitAnswer);
  };

  /**
   * Return the clicked hotspots
   * @return {array} An array containin the indexes of the clicked hotspots
   */
  ImageMultipleHotspotQuestion.prototype.getCurrentState = function () {
    return this.selectedHotspots;
  }

  /**
   * Checks if an answer for this question has been given.
   * Used in contracts.
   * @returns {boolean}
   */
  ImageMultipleHotspotQuestion.prototype.getAnswerGiven = function () {
    return this.hotspotChosen || this.selectedHotspots.length > 0;
  };

  /**
   * Gets the current user score for this question.
   * Used in contracts
   * @returns {number}
   */
  ImageMultipleHotspotQuestion.prototype.getScore = function () {
    return this.score;
  };

  /**
   * Gets the max score for this question.
   * Used in contracts.
   * @returns {number}
   */
  ImageMultipleHotspotQuestion.prototype.getMaxScore = function () {
    return this.maxScore;
  };

  /**
   * Display the first found solution for this question.
   * Used in contracts
   */
  ImageMultipleHotspotQuestion.prototype.showSolutions = function () {
    /*this.$hotspots.forEach(hotspot => {
      if (!hotspot.hasClass("highlight-correct-hotspot")) {
        hotspot.removeClass('highlight-hotspot');
        hotspot.addClass('highlight-correct-hotspot');
      }
    });

    const hotspots = this.wrapper.find('.image-hotspot');
    if (hotspots) {
      hotspots.each(function () {
        if ($(this).hasClass("highlight-hotspot")) {
          $(this).toggleClass('highlight-hotspot');
          $(this).addClass('highlight-wrong-hotspot');
        }
      });
    }*/
  };

  ImageMultipleHotspotQuestion.prototype.resetSolutionHighlight = function () {
    const hotspots = this.wrapper.find('.image-hotspot');
    if (hotspots) {
      hotspots.each(function () {
        $(this).removeClass('highlight-wrong-hotspot');
        $(this).removeClass('highlight-correct-hotspot');
      });
    }
  }

  /**
   * Resets the question.
   * Used in contracts.
   */
  ImageMultipleHotspotQuestion.prototype.resetTask = function () {
    // Remove hotspot feedback
    if (this.hotspotFeedback.$element) {
      this.hotspotFeedback.$element.remove();
    }

    // Reset selected hotspots
    this.selectedHotspots = [];

    // Remove any correct hotspots from array
    this.correctHotspotFeedback = [];

    this.score = 0;
    this.hotspotFeedback.hotspotChosen = false;

    // Hide retry button
    this.hideButton('retry-button');

    if (this.params.behaviour.enableSubmitAnswer) {
      this.showButton('submit-answer');
      this.resetHighlightHotSpot();
      this.resetSolutionHighlight();
    }

    // Clear feedback
    if (this.showScoreFeedback()) {
      this.setFeedback();
    }

    if (this.params.behaviour.enableSubmitAnswerFeedback) {
      const submitAnswerFeedback = this.wrapper.find(
          '.h5p-question-content').find(
          '.submit-answer-feedback');
      if (submitAnswerFeedback) {
        submitAnswerFeedback.remove();
      }
    }
  };

  /**
   * Resize image and wrapper
   */
  ImageMultipleHotspotQuestion.prototype.resize = function () {
    this.resizeImage();
    this.resizeHotspotFeedback();
    this.resizeCorrectHotspotFeedback();
  };

  /**
   * Resize image to fit parent width.
   */
  ImageMultipleHotspotQuestion.prototype.resizeImage = function () {
    var self = this;

    // Check that question has been attached
    if (!(this.$wrapper && this.$img)) {
      return;
    }

    // Resize image to fit new container width.
    var parentWidth = this.$wrapper.width();
    this.$img.width(parentWidth);

    // Find required height for new width.
    var naturalWidth = this.$img.get(0).naturalWidth;
    var naturalHeight = this.$img.get(0).naturalHeight;
    var imageRatio = naturalHeight / naturalWidth;
    var neededHeight = -1;
    if (parentWidth < naturalWidth) {
      // Scale image down
      neededHeight = parentWidth * imageRatio;
    }
    else {
      // Scale image to natural size
      this.$img.width(naturalWidth);
      neededHeight = naturalHeight;
    }

    if (neededHeight !== -1) {
      this.$img.height(neededHeight);

      // Resize wrapper to match image.
      self.$wrapper.height(neededHeight);
    }
  };

  /**
   * Re-position correct hotspot feedback.
   */
  ImageMultipleHotspotQuestion.prototype.resizeCorrectHotspotFeedback = function () {
    // Check that hotspot is chosen
    if (this.correctHotspotFeedback.length === 0) {
      return;
    }

    for (i=0; i < this.correctHotspotFeedback.length; i++) {
      // Calculate positions
      var posX = (this.correctHotspotFeedback[i].percentagePosX * (this.$imageWrapper.width() / 100)) - this.correctHotspotFeedback[i].pixelOffsetX;
      var posY = (this.correctHotspotFeedback[i].percentagePosY * (this.$imageWrapper.height() / 100)) - this.correctHotspotFeedback[i].pixelOffsetY;

      // Apply new positions
      this.correctHotspotFeedback[i].$element.css({
        left: posX,
        top: posY
      });
    }
  };

  /**
   * Re-position hotspot feedback.
   */
  ImageMultipleHotspotQuestion.prototype.resizeHotspotFeedback = function () {
    // Check that hotspot is chosen
    if (!this.hotspotFeedback.hotspotChosen) {
      return;
    }

    // Calculate positions
    var posX = (this.hotspotFeedback.percentagePosX * (this.$imageWrapper.width() / 100)) - this.hotspotFeedback.pixelOffsetX;
    var posY = (this.hotspotFeedback.percentagePosY * (this.$imageWrapper.height() / 100)) - this.hotspotFeedback.pixelOffsetY;

    // Apply new positions
    this.hotspotFeedback.$element.css({
      left: posX,
      top: posY
    });
  };

  ImageMultipleHotspotQuestion.prototype.getTitle = function () {
    return H5P.createTitle((this.contentData.hasOwnProperty("metadata") && this.contentData.metadata.hasOwnProperty("title")) ? this.contentData.metadata.title : 'Find Multiple Hotspots');
  };

  return ImageMultipleHotspotQuestion;
}(H5P.jQuery, H5P.Question));