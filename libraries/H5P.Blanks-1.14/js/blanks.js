/*global H5P*/
H5P.Blanks = (function ($, Question) {
  /**
   * @constant
   * @default
   */
  var STATE_ONGOING = 'ongoing';
  var STATE_CHECKING = 'checking';
  var STATE_SHOWING_SOLUTION = 'showing-solution';
  var STATE_SUBMITTED_SOLUTION = 'submitted-solution';
  var STATE_FINISHED = 'finished';

  const XAPI_ALTERNATIVE_EXTENSION = 'https://h5p.org/x-api/alternatives';
  const XAPI_CASE_SENSITIVITY = 'https://h5p.org/x-api/case-sensitivity';
  const XAPI_REPORTING_VERSION_EXTENSION = 'https://h5p.org/x-api/h5p-reporting-version';

  /**
   * @typedef {Object} Params
   *  Parameters/configuration object for Blanks
   *
   * @property {Object} Params.behaviour
   * @property {string} Params.behaviour.confirmRetryDialog
   * @property {string} Params.behaviour.confirmCheckDialog
   *
   * @property {Object} Params.confirmRetry
   * @property {string} Params.confirmRetry.header
   * @property {string} Params.confirmRetry.body
   * @property {string} Params.confirmRetry.cancelLabel
   * @property {string} Params.confirmRetry.confirmLabel
   *
   * @property {Object} Params.confirmCheck
   * @property {string} Params.confirmCheck.header
   * @property {string} Params.confirmCheck.body
   * @property {string} Params.confirmCheck.cancelLabel
   * @property {string} Params.confirmCheck.confirmLabel
   */

  /**
   * Initialize module.
   *
   * @class H5P.Blanks
   * @extends H5P.Question
   * @param {Params} params
   * @param {number} id Content identification
   * @param {Object} contentData Task specific content data
   */
  function Blanks(params, id, contentData) {
    var self = this;

    // Inheritance
    Question.call(self, 'blanks');

    // IDs
    this.contentId = id;
    this.contentData = contentData;
    this.duration = 0;

    this.params = $.extend(true, {}, {
      text: "Fill in",
      questions: [
        "<p>Oslo is the capital of *Norway*.</p>"
      ],
      overallFeedback: [],
      userAnswers: [], // TODO This isn't in semantics?
      showSolutions: "Show solution",
      tryAgain: "Try again",
      checkAnswer: "Check",
      viewSummary: "View Summary",
      changeAnswer: "Change answer",
      notFilledOut: "Please fill in all blanks to view solution",
      answerIsCorrect: "':ans' is correct",
      answerIsWrong: "':ans' is wrong",
      answeredCorrectly: "Answered correctly",
      answeredIncorrectly: "Answered incorrectly",
      solutionLabel: "Correct answer:",
      inputLabel: "Blank input @num of @total",
      inputHasTipLabel: "Tip available",
      tipLabel: "Tip",
      scoreBarLabel: 'You got :num out of :total points',
      behaviour: {
        enableRetry: true,
        enableSolutionsButton: true,
        enableCheckButton: true,
        caseSensitive: true,
        showSolutionsRequiresInput: true,
        autoCheck: false,
        separateLines: false,
        submissionButtonsAlignment: 'left',
        enableSubmitAnswerFeedback: false,
        ignoreScoring: false,
        ignoreAnswerEvaluation: false
      },
      currikisettings: {
        disableSubmitButton: false,
        currikil10n: {
          submitAnswer: "Submit"
        }
      },
      a11yCheck: 'Check the answers. The responses will be marked as correct, incorrect, or unanswered.',
      a11yShowSolution: 'Show the solution. The task will be marked with its correct solution.',
      a11yRetry: 'Retry the task. Reset all responses and start the task over again.',
      a11yHeader: 'Checking mode',
      submitAnswer: 'Submit',
      submitAnswerFeedback: 'Your answer has been submitted!',
    }, params);

    // Delete empty questions
    for (var i = this.params.questions.length - 1; i >= 0; i--) {
      if (!this.params.questions[i]) {
        this.params.questions.splice(i, 1);
      }
    }

    // Previous state
    this.contentData = contentData;
    if (this.contentData !== undefined && this.contentData.previousState !== undefined) {
      this.previousState = this.contentData.previousState;
    }
    // to set parent in self if present in content data
    if (self.parent === undefined && contentData && contentData.parent) {
      self.parent = contentData.parent;
    }

    // Clozes
    this.clozes = [];

    this.questions_arr = [];

    // Keep track tabbing forward or backwards
    this.shiftPressed = false;

    H5P.$body.keydown(function (event) {
      if (event.keyCode === 16) {
        self.shiftPressed = true;
      }
    }).keyup(function (event) {
      if (event.keyCode === 16) {
        self.shiftPressed = false;
      }
    });

    // Using instructions as label for our text groups
    this.labelId = 'h5p-blanks-instructions-' + Blanks.idCounter;
    this.content = self.createQuestions();

    // Check for task media
    var media = self.params.media;
    if (media && media.type && media.type.library) {
      media = media.type;
      var type = media.library.split(' ')[0];
      if (type === 'H5P.Image') {
        if (media.params.file) {
          // Register task image
          self.setImage(media.params.file.path, {
            disableImageZooming: self.params.media.disableImageZooming || false,
            alt: media.params.alt,
            title: media.params.title
          });
        }
      }
      else if (type === 'H5P.Video') {
        if (media.params.sources) {
          // Register task video
          self.setVideo(media);
        }
      }
      else if (type === 'H5P.Audio') {
        if (media.params.files) {
          // Register task audio
          self.setAudio(media);
        }
      }
    }

    // Register task introduction text
    self.setIntroduction('<div id="' + this.labelId + '">' + self.params.text + '</div>');

    // Register task content area
    self.setContent(self.content, {
      'class': self.params.behaviour.separateLines ? 'h5p-separate-lines' : ''
    });

    // ... and buttons
    self.registerButtons();

    // Restore previous state
    self.setH5PUserState();

    // check is parent is IV or QS, if so then on open then activity will be started
    const isEmbedInComplexActivity = this.contentData && this.contentData.parent && this.contentData.parent.contentData
        && this.contentData.parent.contentData.libraryInfo && this.contentData.parent.contentData.libraryInfo.machineName
        && isDynamicTasks.includes(this.contentData.parent.contentData.libraryInfo.machineName);

    if(!isEmbedInComplexActivity) {
      // start activity time
      self.startStopWatch();
    }

    /**
     * Overrides the set activity started method of the superclass (H5P.EventDispatcher) and calls it
     * at the same time.
     */
    this.setActivityStarted = (function (original) {
      return function () {
        original.call(self);
        self.resetStopWatch();
        self.startStopWatch();
      };
    })(this.setActivityStarted);


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

  var isDynamicTasks = [
    'H5P.InteractiveVideo',
    'H5P.BrightcoveInteractiveVideo',
    'H5P.CurrikiInteractiveVideo',
    'H5P.QuestionSet'
  ];

  // Inheritance
  Blanks.prototype = Object.create(Question.prototype);
  Blanks.prototype.constructor = Blanks;

  /**
   * Create all the buttons for the task
   */
  Blanks.prototype.registerButtons = function () {
    var self = this;

    var $content = $('[data-content-id="' + self.contentId + '"].h5p-content');
    var $containerParents = $content.parents('.h5p-container');

    // select find container to attach dialogs to
    var $container;
    if ($containerParents.length !== 0) {
      // use parent highest up if any
      $container = $containerParents.last();
    }
    else if ($content.length !== 0) {
      $container = $content;
    }
    else  {
      $container = $(document.body);
    }

    if (!self.params.behaviour.autoCheck && this.params.behaviour.enableCheckButton) {
      // Check answer button
      self.addButton('check-answer', self.params.checkAnswer, function () {
        // Move focus to top of content
        self.a11yHeader.innerHTML = self.params.a11yHeader;
        self.a11yHeader.focus();

        // to enable solution mode after check
        self.solutionMode = false;
        self.toggleButtonVisibility(STATE_CHECKING);

        if(typeof self.parent == "undefined") {
          // trigger completed
          self.triggerCompleted();
        }
        self.markResults();
        self.showEvaluation();

        self.triggerAnswered();

        if(!self.isRoot() && self.params.behaviour.enableSubmitAnswerFeedback) {
          var $submit_message = `<div class="submit-answer-feedback">${self.params.submitAnswerFeedback}</div>`;
          self.wrapper.find('.h5p-question-content').append($submit_message);
        }

      }, true, {
        'aria-label': self.params.a11yCheck,
      }, {
        confirmationDialog: {
          enable: self.params.behaviour.confirmCheckDialog,
          l10n: self.params.confirmCheck,
          instance: self,
          $parentElement: $container
        },
        textIfSubmitting: self.params.submitAnswer,
        contentData: self.contentData,
      });

      /*if(typeof this.parent == "undefined") {

        self.addButton('submit Answers', self.params.submitAnswers, function () {
          self.showCorrectAnswers(false);
        }, self.params.behaviour.enableSolutionsButton, {
          'aria-label': self.params.a11yShowSolution,
        });
        self.addButton('view-summary', self.params.viewSummary, function () {

          var confirmationDialog = new H5P.ConfirmationDialog({
            headerText: 'Fill in the blanks Summary',
            dialogText: showSummary(self),
            cancelText: 'Cancel',
            confirmText: "Submit Answers"
          });

          confirmationDialog.on('confirmed', function () {
            self.triggerXAPIScored(0, 1, 'submitted-curriki');
            //confirmationDialog.hide();
            H5P.jQuery('.h5p-question-check-answer').click();

          });

          console.log(self.a11yHeader);
          confirmationDialog.appendTo(parent.document.body);
          confirmationDialog.show();


        }, true, {
          'aria-label': self.params.a11yCheck,
        }, {
          confirmationDialog: {
            enable: self.params.behaviour.confirmCheckDialog,
            l10n: self.params.confirmCheck,
            instance: self,
            $parentElement: $container
          }
        });
      }*/

    }

    if (!self.params.currikisettings.disableSubmitButton && typeof self.parent == "undefined") {
      // Show submit button
      self.addButton('submit-answer', self.params.currikisettings.currikil10n.submitAnswer,  function () {
            self.submitted = true;
            self.toggleButtonVisibility(STATE_SUBMITTED_SOLUTION);
            self.triggerXAPIScored(self.getScore(), self.getMaxScore(), 'submitted-curriki');
            // var $submit_message = '<div class="submit-answer-feedback" style = "color: red">Result has been submitted successfully</div>';
            // H5P.jQuery('.h5p-question-buttons').after($submit_message);
          }, true
      );
    }

    // Show solution button
    self.addButton('show-solution', self.params.showSolutions, function () {
      self.solutionMode = true;
      H5P.jQuery('.submit-answer-feedback').remove();
      self.showCorrectAnswers(false);
    }, self.params.behaviour.enableSolutionsButton, {
      'aria-label': self.params.a11yShowSolution,
    });

    // Try again button
    if (self.params.behaviour.enableRetry === true) {
      self.addButton('try-again', self.params.tryAgain, function () {
        self.a11yHeader.innerHTML = '';
        self.resetTask();
        self.$questions.filter(':first').find('input:first').focus();
        H5P.jQuery('.submit-answer-feedback').remove();
      }, true, {
        'aria-label': self.params.a11yRetry,
      }, {
        confirmationDialog: {
          enable: self.params.behaviour.confirmRetryDialog,
          l10n: self.params.confirmRetry,
          instance: self,
          $parentElement: $container
        }
      });
    }
    self.toggleButtonVisibility(STATE_ONGOING);
  };



  function removeItemAll(arr, value) {

    var i = 0;
    while (i < arr.length) {
      if (arr[i] === value) {
        arr.splice(i, 1);
      } else {
        ++i;
      }
    }

    return arr;
  }
  /**
   * Find blanks in a string and run a handler on those blanks
   *
   * @param {string} question
   *   Question text containing blanks enclosed in asterisks.
   * @param {function} handler
   *   Replaces the blanks text with an input field.
   * @returns {string}
   *   The question with blanks replaced by the given handler.
   */
  Blanks.prototype.handleBlanks = function (question, handler) {
    // Go through the text and run handler on all asterisk
    var clozeEnd, clozeStart = question.indexOf('*');
    var self = this;
    while (clozeStart !== -1 && clozeEnd !== -1) {
      clozeStart++;
      clozeEnd = question.indexOf('*', clozeStart);
      if (clozeEnd === -1) {
        continue; // No end
      }
      var clozeContent = question.substring(clozeStart, clozeEnd);
      var replacer = '';
      if (clozeContent.length) {
        replacer = handler(self.parseSolution(clozeContent));
        clozeEnd++;
      }
      else {
        clozeStart += 1;
      }
      question = question.slice(0, clozeStart - 1) + replacer + question.slice(clozeEnd);
      clozeEnd -= clozeEnd - clozeStart - replacer.length;

      // Find the next cloze
      clozeStart = question.indexOf('*', clozeEnd);
    }
    var return_question = question.split('<span class="h5p-input-wrapper"><input type="text" class="h5p-text-input" autocomplete="off" autocapitalize="off" spellcheck="false"></span>');


    return_question.pop();
    this.questions_arr = this.questions_arr.concat(return_question);

    return question;
  };

  /**
   * Create questitons html for DOM
   */
  Blanks.prototype.createQuestions = function () {
    var self = this;

    var html = '';
    var clozeNumber = 0;
    for (var i = 0; i < self.params.questions.length; i++) {
      var question = self.params.questions[i];

      // Go through the question text and replace all the asterisks with input fields
      question = self.handleBlanks(question, function (solution) {
        // Create new cloze
        clozeNumber += 1;
        var defaultUserAnswer = (self.params.userAnswers.length > self.clozes.length ? self.params.userAnswers[self.clozes.length] : null);
        var cloze = new Blanks.Cloze(solution, self.params.behaviour, defaultUserAnswer, {
          answeredCorrectly: self.params.answeredCorrectly,
          answeredIncorrectly: self.params.answeredIncorrectly,
          solutionLabel: self.params.solutionLabel,
          inputLabel: self.params.inputLabel,
          inputHasTipLabel: self.params.inputHasTipLabel,
          tipLabel: self.params.tipLabel
        });

        self.clozes.push(cloze);
        return cloze;
      });

      html += '<div role="group" aria-labelledby="' + self.labelId + '">' + question + '</div>';
    }

    self.hasClozes = clozeNumber > 0;
    this.$questions = $(html);

    self.a11yHeader = document.createElement('div');
    self.a11yHeader.classList.add('hidden-but-read');
    self.a11yHeader.tabIndex = -1;
    self.$questions[0].insertBefore(self.a11yHeader, this.$questions[0].childNodes[0] || null);

    // Set input fields.
    this.$questions.find('input').each(function (i) {
      var afterCheck;
      if (self.params.behaviour.autoCheck) {
        afterCheck = function () {
          var answer = $("<div>").text(this.getUserAnswer()).html();
          self.read((this.correct() ? self.params.answerIsCorrect : self.params.answerIsWrong).replace(':ans', answer));
          if (self.done || self.allBlanksFilledOut()) {
            // All answers has been given. Show solutions button.
            self.toggleButtonVisibility(STATE_CHECKING);
            self.showEvaluation();
            self.triggerAnswered();
            // trigger completed
            self.triggerCompleted();
            self.done = true;
          }
        };
      }
      self.clozes[i].setInput($(this), afterCheck, function () {
        self.toggleButtonVisibility(STATE_ONGOING);
        if (!self.params.behaviour.autoCheck) {
          self.hideEvaluation();
        }
      }, i, self.clozes.length);
    }).keydown(function (event) {
      var $this = $(this);

      // Adjust width of text input field to match value
      self.autoGrowTextField($this);

      var $inputs, isLastInput;
      var enterPressed = (event.keyCode === 13);
      var tabPressedAutoCheck = (event.keyCode === 9 && self.params.behaviour.autoCheck);

      if (enterPressed || tabPressedAutoCheck) {
        // Figure out which inputs are left to answer
        $inputs = self.$questions.find('.h5p-input-wrapper:not(.h5p-correct) .h5p-text-input');

        // Figure out if this is the last input
        isLastInput = $this.is($inputs[$inputs.length - 1]);
      }

      if ((tabPressedAutoCheck && isLastInput && !self.shiftPressed) ||
          (enterPressed && isLastInput)) {
        // Focus first button on next tick
        setTimeout(function () {
          self.focusButton();
        }, 10);
      }

      if (enterPressed) {
        if (isLastInput) {
          // Check answers
          $this.trigger('blur');
        }
        else {
          // Find next input to focus
          $inputs.eq($inputs.index($this) + 1).focus();
        }

        return false; // Prevent form submission on enter key
      }
    }).on('change', function () {
      self.answered = true;
      self.triggerXAPI('interacted');
    });

    self.on('resize', function () {
      self.resetGrowTextField();
    });

    return this.$questions;
  };

  /**
   *
   */
  Blanks.prototype.autoGrowTextField = function ($input) {
    // Do not set text field size when separate lines is enabled
    if (this.params.behaviour.separateLines) {
      return;
    }

    var self = this;
    var fontSize = parseInt($input.css('font-size'), 10);
    var minEm = 3;
    var minPx = fontSize * minEm;
    var rightPadEm = 3.25;
    var rightPadPx = fontSize * rightPadEm;
    var static_min_pad = 0.5 * fontSize;

    setTimeout(function () {
      var tmp = $('<div>', {
        'text': $input.val()
      });
      tmp.css({
        'position': 'absolute',
        'white-space': 'nowrap',
        'font-size': $input.css('font-size'),
        'font-family': $input.css('font-family'),
        'padding': $input.css('padding'),
        'width': 'initial'
      });
      $input.parent().append(tmp);
      var width = tmp.width();
      var parentWidth = self.$questions.width();
      tmp.remove();
      if (width <= minPx) {
        // Apply min width
        $input.width(minPx + static_min_pad);
      }
      else if (width + rightPadPx >= parentWidth) {
        // Apply max width of parent
        $input.width(parentWidth - rightPadPx);
      }
      else {
        // Apply width that wraps input
        $input.width(width + static_min_pad);
      }
    }, 1);
  };

  function showSummary(self) {

    var table_content = '<tbody>';
    for (var m =0; m < self.clozes.length; m++){

      var strwa = self.questions_arr[m].replace('<br>','');
      var strwa = strwa.replace('<p>','');
      var strwa = strwa.replace('.','');
      var answer_status = (self.clozes[m].correct()) ? "Correct" : "Incorrect";
      table_content += '<tr>';
      table_content += '<td>'+strwa+'</td>';
      table_content += '<td>'+self.clozes[m].getUserAnswer()+'</td>';
      table_content += '<td>'+answer_status+'</td>';
      table_content += '</tr>';

    }
    var summary_html = '<div class="custom-summary-section"><div class="h5p-summary-table-pages"><table class="h5p-score-table-custom" style="min-height:100px;width:100%"><thead><tr><th>Question</th><th>Answer</th><th>Result</th></tr></thead>'+table_content+'</table></div></div>';
    return summary_html;
  }

  /**
   * Resize all text field growth to current size.
   */
  Blanks.prototype.resetGrowTextField = function () {
    var self = this;

    this.$questions.find('input').each(function () {
      self.autoGrowTextField($(this));
    });
  };

  /**
   * Toggle buttons dependent of state.
   *
   * Using CSS-rules to conditionally show/hide using the data-attribute [data-state]
   */
  Blanks.prototype.toggleButtonVisibility = function (state) {
    // The show solutions button is hidden if all answers are correct
    var allCorrect = (this.getScore() === this.getMaxScore());
    if (this.params.behaviour.autoCheck && allCorrect) {
      // We are viewing the solutions
      state = STATE_FINISHED;
    }

    if (this.params.behaviour.enableSolutionsButton) {
      if (!this.solutionMode && (state === STATE_CHECKING && !allCorrect || state === STATE_SUBMITTED_SOLUTION)) {
        this.showButton('show-solution');
      }
      else {
        this.hideButton('show-solution');
      }
    }

    if (this.params.behaviour.enableRetry) {
      if ((state === STATE_CHECKING && !allCorrect) || state === STATE_SHOWING_SOLUTION || state === STATE_SUBMITTED_SOLUTION) {
        this.showButton('try-again');
      }
      else {
        this.hideButton('try-again');
      }
    }

    if(!this.params.currikisettings.disableSubmitButton) {
      if(!this.submitted && (state === STATE_CHECKING || state === STATE_SHOWING_SOLUTION || state === STATE_FINISHED)) {
        this.showButton('submit-answer');
      } else {
        this.hideButton('submit-answer');
      }
    }

    if (state === STATE_ONGOING) {
      this.showButton('check-answer');
    }
    else {
      this.hideButton('check-answer');
    }

    this.trigger('resize');
  };

  /**
   * Check if solution is allowed. Warn user if not
   */
  Blanks.prototype.allowSolution = function () {
    if (this.params.behaviour.showSolutionsRequiresInput === true) {
      if (!this.allBlanksFilledOut()) {
        this.updateFeedbackContent(this.params.notFilledOut);
        this.read(this.params.notFilledOut);
        return false;
      }
    }
    return true;
  };

  /**
   * Check if all blanks are filled out
   *
   * @method allBlanksFilledOut
   * @return {boolean} Returns true if all blanks are filled out.
   */
  Blanks.prototype.allBlanksFilledOut = function () {
    return !this.clozes.some(function (cloze) {
      return !cloze.filledOut();
    });
  };

  /**
   * Mark which answers are correct and which are wrong and disable fields if retry is off.
   */
  Blanks.prototype.markResults = function () {
    var self = this;
    for (var i = 0; i < self.clozes.length; i++) {
      self.clozes[i].checkAnswer();
      if (!self.params.behaviour.enableRetry) {
        self.clozes[i].disableInput();
      }
    }
    this.trigger('resize');
  };

  /**
   * Removed marked results
   */
  Blanks.prototype.removeMarkedResults = function () {
    this.$questions.find('.h5p-input-wrapper').removeClass('h5p-correct h5p-wrong');
    this.$questions.find('.h5p-input-wrapper > input').attr('disabled', false);
    this.trigger('resize');
  };


  /**
   * Displays the correct answers
   * @param {boolean} [alwaysShowSolution]
   *  Will always show solution if true
   */
  Blanks.prototype.showCorrectAnswers = function (alwaysShowSolution) {
    if (!alwaysShowSolution && !this.allowSolution()) {
      return;
    }

    this.toggleButtonVisibility(STATE_SHOWING_SOLUTION);
    this.hideSolutions();

    for (var i = 0; i < this.clozes.length; i++) {
      this.clozes[i].showSolution();
    }
    this.trigger('resize');
  };

  /**
   * Toggle input allowed for all input fields
   *
   * @method function
   * @param  {boolean} enabled True if fields should allow input, otherwise false
   */
  Blanks.prototype.toggleAllInputs = function (enabled) {
    for (var i = 0; i < this.clozes.length; i++) {
      this.clozes[i].toggleInput(enabled);
    }
  };

  /**
   * Display the correct solution for the input boxes.
   *
   * This is invoked from CP and QS - be carefull!
   */
  Blanks.prototype.showSolutions = function () {
    this.params.behaviour.enableSolutionsButton = true;
    this.toggleButtonVisibility(STATE_FINISHED);
    this.markResults();
    this.showEvaluation();
    this.showCorrectAnswers(true);
    this.toggleAllInputs(false);
    //Hides all buttons in "show solution" mode.
    this.hideButtons();
  };

  /**
   * Resets the complete task.
   * Used in contracts.
   * @public
   */
  Blanks.prototype.resetTask = function () {
    this.answered = false;
    this.submitted = false;
    this.solutionMode = false;
    this.hideEvaluation();
    this.hideSolutions();
    this.clearAnswers();
    this.removeMarkedResults();
    this.toggleButtonVisibility(STATE_ONGOING);
    this.resetGrowTextField();
    this.toggleAllInputs(true);
    this.resetStopWatch();
    this.done = false;
  };

  /**
   * Hides all buttons.
   * @public
   */
  Blanks.prototype.hideButtons = function () {
    this.toggleButtonVisibility(STATE_FINISHED);
  };

  /**
   * Trigger xAPI answered event
   */
  Blanks.prototype.triggerAnswered = function () {
    this.answered = true;
    var xAPIEvent = this.createXAPIEventTemplate('answered');
    this.addQuestionToXAPI(xAPIEvent);
    this.addResponseToXAPI(xAPIEvent);
    this.trigger(xAPIEvent);
  };

  /**
   * Trigger xAPI completed event
   */
  Blanks.prototype.triggerCompleted = function () {
    this.triggerXAPIScored(this.getScore(), this.getMaxScore(), 'completed');
  };


  /**
   * Get xAPI data.
   * Contract used by report rendering engine.
   *
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-6}
   */
  Blanks.prototype.getXAPIData = function () {
    var xAPIEvent = this.createXAPIEventTemplate('answered');
    this.addQuestionToXAPI(xAPIEvent);
    this.addResponseToXAPI(xAPIEvent);
    return {
      statement: xAPIEvent.data.statement
    };
  };

  /**
   * Generate xAPI object definition used in xAPI statements.
   * @return {Object}
   */
  Blanks.prototype.getxAPIDefinition = function () {
    var definition = {};
    definition.description = {
      'en-US': this.params.text + '\n'
    };
    definition.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';
    definition.interactionType = 'fill-in';

    const clozeSolutions = [];
    let crp = '';
    // xAPI forces us to create solution patterns for all possible solution combinations
    for (var i = 0; i < this.params.questions.length; i++) {
      var question = this.handleBlanks(this.params.questions[i], function (solution) {
        // Collect all solution combinations for the H5P Alternative extension
        clozeSolutions.push(solution.solutions);

        // Create a basic response pattern out of the first alternative for each blanks field
        crp += (!crp ? '' : '[,]') + solution.solutions[0];

        // We replace the solutions in the question with a "blank"
        return '__________';
      });
      definition.description['en-US'] += question;
    }

    // Set the basic response pattern (not supporting multiple alternatives for blanks)
    definition.correctResponsesPattern = [
      '{case_matters=' + this.params.behaviour.caseSensitive + '}' + crp,
    ];

    // Add the H5P Alternative extension which provides all the combinations of different answers
    // Reporting software will need to support this extension for alternatives to work.
    definition.extensions = definition.extensions || {};
    definition.extensions[XAPI_CASE_SENSITIVITY] = this.params.behaviour.caseSensitive;
    definition.extensions[XAPI_ALTERNATIVE_EXTENSION] = clozeSolutions;

    return definition;
  };

  /**
   * Add the question itselt to the definition part of an xAPIEvent
   */
  Blanks.prototype.addQuestionToXAPI = function (xAPIEvent) {
    var definition = xAPIEvent.getVerifiedStatementValue(['object', 'definition']);
    $.extend(true, definition, this.getxAPIDefinition());

    // Set reporting module version if alternative extension is used
    if (this.hasAlternatives) {
      const context = xAPIEvent.getVerifiedStatementValue(['context']);
      context.extensions = context.extensions || {};
      context.extensions[XAPI_REPORTING_VERSION_EXTENSION] = '1.1.0';
    }
  };

  /**
   * Parse the solution text (text between the asterisks)
   *
   * @param {string} solutionText
   * @returns {object} with the following properties
   *  - tip: the tip text for this solution, undefined if no tip
   *  - solutions: array of solution words
   */
  Blanks.prototype.parseSolution = function (solutionText) {
    var tip, solution;

    var tipStart = solutionText.indexOf(':');
    if (tipStart !== -1) {
      // Found tip, now extract
      tip = solutionText.slice(tipStart + 1);
      solution = solutionText.slice(0, tipStart);
    }
    else {
      solution = solutionText;
    }

    // Split up alternatives
    var solutions = solution.split('/');
    this.hasAlternatives = this.hasAlternatives || solutions.length > 1;

    // Trim solutions
    for (var i = 0; i < solutions.length; i++) {
      solutions[i] = H5P.trim(solutions[i]);

      //decodes html entities
      var elem = document.createElement('textarea');
      elem.innerHTML = solutions[i];
      solutions[i] = elem.value;
    }

    return {
      tip: tip,
      solutions: solutions
    };
  };

  /**
   * Add the response part to an xAPI event
   *
   * @param {H5P.XAPIEvent} xAPIEvent
   *  The xAPI event we will add a response to
   */
  Blanks.prototype.addResponseToXAPI = function (xAPIEvent) {
    xAPIEvent.setScoredResult(this.getScore(), this.getMaxScore(), this);
    xAPIEvent.data.statement.result.response = this.getxAPIResponse();
    const duration = this.stopStopWatch();
    xAPIEvent.data.statement.result.duration = 'PT' + duration + 'S';
  };

  /**
   * Generate xAPI user response, used in xAPI statements.
   * @return {string} User answers separated by the "[,]" pattern
   */
  Blanks.prototype.getxAPIResponse = function () {
    var usersAnswers = this.getCurrentState();
    return usersAnswers.join('[,]');
  };

  /**
   * Show evaluation widget, i.e: 'You got x of y blanks correct'
   */
  Blanks.prototype.showEvaluation = function () {
    if (this.params.behaviour.ignoreScoring) {
      return;
    }
    var maxScore = this.getMaxScore();
    var score = this.getScore();
    var scoreText = H5P.Question.determineOverallFeedback(this.params.overallFeedback, score / maxScore).replace('@score', score).replace('@total', maxScore);

    this.setFeedback(scoreText, score, maxScore, this.params.scoreBarLabel);

    if (score === maxScore) {
      this.toggleButtonVisibility(STATE_FINISHED);
    }
  };

  /**
   * Hide the evaluation widget
   */
  Blanks.prototype.hideEvaluation = function () {
    // Clear evaluation section.
    this.removeFeedback();
  };

  /**
   * Hide solutions. (/try again)
   */
  Blanks.prototype.hideSolutions = function () {
    // Clean solution from quiz
    this.$questions.find('.h5p-correct-answer').remove();
  };

  /**
   * Get maximum number of correct answers.
   *
   * @returns {Number} Max points
   */
  Blanks.prototype.getMaxScore = function () {
    var self = this;
    return self.clozes.length;
  };

  /**
   * Count the number of correct answers.
   *
   * @returns {Number} Points
   */
  Blanks.prototype.getScore = function () {
    var self = this;
    var correct = 0;
    for (var i = 0; i < self.clozes.length; i++) {
      if (self.clozes[i].correct()) {
        correct++;
      }
      self.params.userAnswers[i] = self.clozes[i].getUserAnswer();
    }

    return correct;
  };

  Blanks.prototype.getTitle = function () {
    return H5P.createTitle((this.contentData.metadata && this.contentData.metadata.title) ? this.contentData.metadata.title : 'Fill In');
  };

  /**
   * Clear the user's answers
   */
  Blanks.prototype.clearAnswers = function () {
    this.clozes.forEach(function (cloze) {
      cloze.setUserInput('');
      cloze.resetAriaLabel();
    });
  };

  /**
   * Checks if all has been answered.
   *
   * @returns {Boolean}
   */
  Blanks.prototype.getAnswerGiven = function () {
    return this.answered || !this.hasClozes;
  };

  /**
   * Helps set focus the given input field.
   * @param {jQuery} $input
   */
  Blanks.setFocus = function ($input) {
    setTimeout(function () {
      $input.focus();
    }, 1);
  };

  /**
   * Returns an object containing content of each cloze
   *
   * @returns {object} object containing content for each cloze
   */
  Blanks.prototype.getCurrentState = function () {
    var clozesContent = [];

    // Get user input for every cloze
    this.clozes.forEach(function (cloze) {
      clozesContent.push(cloze.getUserAnswer());
    });
    return clozesContent;
  };

  /**
   * Sets answers to current user state
   */
  Blanks.prototype.setH5PUserState = function () {
    var self = this;
    var isValidState = (this.previousState !== undefined &&
        this.previousState.length &&
        this.previousState.length === this.clozes.length);

    // Check that stored user state is valid
    if (!isValidState) {
      return;
    }

    // Set input from user state
    var hasAllClozesFilled = true;
    this.previousState.forEach(function (clozeContent, ccIndex) {

      // Register that an answer has been given
      if (clozeContent.length) {
        self.answered = true;
      }

      var cloze = self.clozes[ccIndex];
      cloze.setUserInput(clozeContent);

      // Handle instant feedback
      if (self.params.behaviour.autoCheck) {
        if (cloze.filledOut()) {
          cloze.checkAnswer();
        }
        else {
          hasAllClozesFilled = false;
        }
      }
    });

    if (self.params.behaviour.autoCheck && hasAllClozesFilled) {
      self.showEvaluation();
      self.toggleButtonVisibility(STATE_CHECKING);
    }
  };

  /**
   * Disables any active input. Useful for freezing the task and dis-allowing
   * modification of wrong answers.
   */
  Blanks.prototype.disableInput = function () {
    this.$questions.find('input').attr('disabled', true);
  };

  Blanks.idCounter = 0;

  /**
   * Starts the stop watch
   *
   * @public
   */
  Blanks.prototype.startStopWatch = function(){
    /**
     * @property {number}
     */
    this.startTime = Date.now();
    return this;
  };

  /**
   * Stops the stopwatch, and returns the duration in seconds.
   *
   * @public
   * @return {number}
   */
  Blanks.prototype.stopStopWatch = function(){
    this.duration = this.duration + Date.now() - this.startTime;
    return this.passedTimeStopWatch();
  };

  /**
   * Sets the duration to 0
   *
   * @public
   */
  Blanks.prototype.resetStopWatch = function(){
    this.duration = 0;
    this.startTime = Date.now();
  };

  /**
   * Returns the passed time in seconds
   *
   * @public
   * @return {number}
   */
  Blanks.prototype.passedTimeStopWatch = function(){
    return Math.round(this.duration / 10) / 100;
  };

  return Blanks;
})(H5P.jQuery, H5P.Question);

/**
 * Static utility method for parsing H5P.Blanks qestion into a format useful
 * for creating reports.
 * 
 * Example question: 'H5P content may be edited using a *browser/web-browser:something you use every day*.'
 * 
 * Produces the following result:
 * [
 *   {
 *     type: 'text',
 *     content: 'H5P content may be edited using a '
 *   },
 *   {
 *     type: 'answer',
 *     correct: ['browser', 'web-browser']
 *   },
 *   {
 *     type: 'text',
 *     content: '.'
 *   }
 * ]
 * 
 * @param {string} question 
 */
H5P.Blanks.parseText = function (question) {
  var blank = new H5P.Blanks({ question: question });

  /**
   * Parses a text into an array where words starting and ending
   * with an asterisk are separated from other text.
   * e.g ["this", "*is*", " an ", "*example*"]
   *
   * @param {string} text
   *
   * @return {string[]}
   */
  function tokenizeQuestionText(text) { 
    return text.split(/(\*.*?\*)/).filter(function (str) { 
      return str.length > 0; }
    );
  }

  function startsAndEndsWithAnAsterisk(str) {
    return str.substr(0,1) === '*' && str.substr(-1) === '*';
  }

  function replaceHtmlTags(str, value) {
    return str.replace(/<[^>]*>/g, value);
  }

  return tokenizeQuestionText(replaceHtmlTags(question, '')).map(function (part) {
    return startsAndEndsWithAnAsterisk(part) ? 
      ({
        type: 'answer',
        correct: blank.parseSolution(part.slice(1, -1)).solutions
      }) :
      ({
        type: 'text',
        content: part
      });
  });
};
