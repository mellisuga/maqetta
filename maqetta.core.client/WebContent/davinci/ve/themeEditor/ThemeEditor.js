dojo.provide("davinci.ve.themeEditor.ThemeEditor");
 
dojo.require("dijit.layout.TabContainer");
dojo.require("davinci.ve.themeEditor.VisualThemeEditor");
dojo.require("davinci.html.CSSModel");
//dojo.require("davinci.ve.utils.URLResolver");
dojo.require("davinci.ve.themeEditor.metadata.query");
dojo.require("davinci.ve.VisualEditorOutline");
dojo.require("davinci.html.CSSModel");
dojo.require("davinci.html.HTMLModel");
dojo.require("dojox.html.styles");
dojo.require("davinci.ve.themeEditor.metadata.metadata");
dojo.require("davinci.ve.States");
dojo.require("davinci.ui.ModelEditor");
dojo.require("davinci.ve.themeEditor.ThemeColor");
// undo
dojo.require("davinci.commands.Command");
dojo.require("davinci.ve.themeEditor.commands.ThemeEditorCommand");
dojo.require("davinci.ve.themeEditor.commands.SubwidgetChangeCommand");
dojo.require("davinci.ve.themeEditor.commands.StyleChangeCommand");
dojo.require("davinci.ve.themeEditor.commands.StateChangeCommand");
//dojo.require("davinci.ve.themeEditor.commands.ModifyTheme");
dojo.require("davinci.commands.CommandStack");
dojo.require("davinci.ve.ThemeModifier");


dojo.declare("davinci.ve.themeEditor.ThemeEditor", [davinci.ui.ModelEditor,davinci.ve.ThemeModifier], {
	
	children : [], //FIXME: shared array
	visualEditor : null, 
	_currentState: "Normal", // the state is for all the widgets on the page
	_dirtyResource : {},
	_subWidgetSelection:null,
	_theme:null,
	_tempRules : {}, // FIXME: shared object
	_subscriptions : [], // FIXME: shared array
	__DEBUG_TO_CONSOLE : false,
	_shortHands: ['border', 'padding', 'margin', 'background','font', 'list-style'],
	
	
	constructor: function (element) {
		
		this.inherited(arguments);
		this._cp = new dijit.layout.ContentPane({}, element);
		this.domNode = this._cp.domNode;
		this.domNode.className = "ThemeEditor fullPane";
	},
	
	onResize: function(){
		var context = this.getContext();
		var widget = this.getSelectedWidget();
		context.select(widget, false); // at least for V0.6 theme editor does not support multi select .select(widget, false); // at least for V0.6 theme editor does not support multi select 
	},
	
	getSelectionProperties: function(updateContext){
		if(!this._selectedWidget) {
			return [{editor:this, widget:null, subwidget:null, cssValues: null, computedCssValues:null, appliesTo:['theme'], context:this.context }];
		}
		
		 var v = this._getSelectionStyleValues(); 
		 var domNode;
			var rules = this._getCssRules();
			this._rebaseCssRuleImagesForStylePalette(rules, v);
		 
		 
		 var widgetType = this._selectedWidget.type;
		 var domNode = this._theme.getDomNode(this._selectedWidget.domNode, widgetType, this._selectedSubWidget);
		 var allStyle = dojo.getComputedStyle(domNode);
		 
		 return {editor:this, widget:this._selectedWidget, subwidget:this._selectedSubWidget, cssValues: v, computedCssValues:allStyle, appliesTo:['theme'], context:this.context};
		
	}, 


	_widgetStateChanged : function (e){
		if(!this.isActiveEditor()) { return; }
		if (e.origin && e.origin.indexOf("davinci.ve.themeEditor.commands.")>-1){
			//then message was generated by undo or redo so bail.
			return;
		}
		if (this._currentSelectionRules) {
			delete this._currentSelectionRules;
		}
		if (e.widget.processingUndoRedo){
			delete e.widget.processingUndoRedo; // this is a hack to get around the event firing on a undo from the outline view
			return;
		}

		this.getContext().getCommandStack().execute(new davinci.ve.themeEditor.commands.StateChangeCommand({_themeEditor: this,
			_widget: e.widget, _newState: e.newState, _oldState: e.oldState, _firstRun: true
		}));
		
		
	},
	
	selectSubwidget: function(widget, subwidget){
		if (!widget || !subwidget) { return; }
		var widgetType = this._theme.getWidgetType(widget);
		var domNode = this._theme.getDomNode(widget.domNode, widgetType, subwidget);
		
		var realleft =0;
		var realtop = 0;
		var obj = domNode;
		if (obj.offsetParent) {
			do {
				realleft += obj.offsetLeft;
				realtop += obj.offsetTop;
			} while (obj = obj.offsetParent);
		}
		var frame = this.getContext().getDocument().createElement("div");
		frame.className = "editSubwidgetFocusFrame";
		frame.id = "editSubwidgetFocusFrame";
		frame.style.position = "absolute";
		frame.style.width = domNode.offsetWidth + "px";
		frame.style.height = domNode.offsetHeight + "px";
		var padding = 2; // put some space between the subwidget and box
		realtop = realtop - padding;
		realleft = realleft - padding;
		frame.style.top = realtop + "px";
		frame.style.left = realleft + "px";
		frame.style.padding = padding + 'px';
		frame.style.display = "block";
		this._selectedWidget.domNode.parentNode.appendChild(frame);
		this._subWidgetFocusFrame = frame;

	},
	
	deselectSubwidget: function(widget, subwidget){
//		if (!widget || !subwidget) { return; }
		if (this._subWidgetFocusFrame){
			this._subWidgetFocusFrame.parentNode.removeChild(this._subWidgetFocusFrame);
			this._subWidgetFocusFrame = null;
		}

	},
	
	_subwidgetSelectionChanged: function (e){


//		if(!this.isActiveEditor() ||  !(this._selectedWidget || this._selectedSubWidget) ) return;
//
//		
//		this._selectedSubWidget = e.subwidget;
//		this.selectSubwidget(this._selectedWidget, this._selectedSubWidget);
//		dojo.publish("/davinci/ui/widgetSelected"[[this._selectedWidget]]);
		if (e.origin && e.origin.indexOf("davinci.ve.themeEditor.commands.")>-1){
			//then message was generated by undo or redo so bail.
			return;
		}
		if (this._currentSelectionRules) {
			delete this._currentSelectionRules;
		}
	
		if(!this.isActiveEditor() ||  !(this._selectedWidget || this._selectedSubWidget) ) { return; }
		
		this.getContext().getCommandStack().execute(new davinci.ve.themeEditor.commands.SubwidgetChangeCommand({_themeEditor: this,
			_subwidget: e.subwidget
		}));
		
	},
	
	_getSelectionStyleValues: function (){
		//debugger;;
		
		var rules=this._getCssRules();
		if(rules.length==0) {
			return null;
		}
		var allProps = {};
		for(var s = 0; s < rules.length; s++){
			var rule=rules[s];
			for(var p = 0;p<rule.properties.length;p++){
				if(!allProps[rule.properties[p].name]){ // set to first found
					allProps[rule.properties[p].name] = rule.properties[p].value;
				}
			}
		}
		allProps = this.convertShortHandProps(allProps);
		return allProps;
	},
	
	addShortHandProps: function (values){
		var shortHands = this._shortHands;
		var styleStr = '';
		for (a in values){
			styleStr = styleStr + ' ' + a + ': ' + values[a] + ';';
		}
		var e = dojo.doc.createElement('div');
		e.style.cssText = styleStr;
//		for (var i = 0; i<shortHands.length; i++){
//			var sh = shortHands[i];
//			if (e.style[sh]){
//				values[sh] = e.style[sh];
//			}
//		}
		for (v in values){
			var name = dashedToCamel(v);
			if (e.style[name]){
				values[v] = e.style[name];
			}
		}

		return values;
		
		function dashedToCamel (str){
			return str.replace(/(\-[a-z])/g, function($1){return $1.toUpperCase().replace('-','');});
		}
	},
	
	convertShortHandProps: function (props){
		var shortHands = this._shortHands;
		//var shortHands = ['border', 'padding', 'margin', 'background','font', 'list-style'];
		for (var x = 0; x<shortHands.length; x++){
			var sh = shortHands[x];
			if(props[sh]){
				var e = dojo.doc.createElement('div');
				e.style.cssText = sh + ': '+ props[sh] + ';';
				var i = 0;
				for (n in e.style){
					if (n.indexOf(sh)>-1){
						var name = camelCaseToDashed(n);
						if (e.style[n])
							props[name]= e.style[n];
					}
				}
			}
		}
	
		function camelCaseToDashed(str){
			return str.replace(/([A-Z])/g, function($1){return "-"+$1.toLowerCase();});
		}

		
		
		function cssNameToJSName(val) {

	        var newVal = '';
	        val = val.split('-');
	        // do not upppercase first word
	        newVal += val[0].substring(0,1).toLowerCase() + val[0].substring(1,val[0].length);
	        for(var c=1; c < val.length; c++) {
	        	if(val[c] != 'value' )
	                newVal += val[c].substring(0,1).toUpperCase() + val[c].substring(1,val[c].length);
	        }
	        return newVal;
		}
		
		return props;
	},
	
	_getCssRules: function (widget, subWidget, state){
		//debugger;;
		if (this._currentSelectionRules) {
			return this._currentSelectionRules;
		}
		if (!subWidget) { subWidget = null; }
		var selectors = this._loadCssSelectors(widget, subWidget, state);
		var rules = [];
		if(!selectors) {
			return null;
		}
		var allProps = {};
		for(var s = 0; s < selectors.length; s++){
			var cssFiles = this._getCssFiles();
			if (cssFiles){
				for(var i = 0;i<cssFiles.length;i++){
					var selectorNodes = cssFiles[i].getRules(selectors[s]);
					for (sn = 0; sn < selectorNodes.length; sn++){
						var selectorNode = selectorNodes[sn];
						if(selectorNode){
							var rule = selectorNode.searchUp( "CSSRule");
							if(rule){
								rules.push(rule);
							}
						}
					}
				}
			}
		}
		if (rules.length > 0) {
			this._currentSelectionRules = rules;
		}
		return rules;
	},
	
	focus : function (){
		
		this.onSelectionChange([this.getSelectedWidget()]);
		
	},
	supports : function (something){
		return something =="style" || something == "states";
	},
	
	onSelectionChange : function(a){

 		if(!this.isActiveEditor() || !a || !a[0]) { return; }
		if(this._selectedWidget && (this._selectedWidget.id == a[0].id)) {
			return; // the object is already selected, the only timeI have seen this is on a redo command
		}
		if (this._currentSelectionRules) {
			delete this._currentSelectionRules;
		}
		this.getContext().getCommandStack().execute(new davinci.ve.themeEditor.commands.ThemeEditorCommand({_themeEditor: this,
			_widget: a, _firstRun: true

		}));


	},
	getSelectedWidget : function(){
		
		var context = this.getContext();
		
		var selection = context.getSelection();
		var widget = (selection.length > 0 ? selection[selection.length - 1] : undefined);
		if(selection.length > 1){
			context.select(widget);
		}
		return widget;
	},
	getSelectedSubWidget : function(){
		if(this._selectedSubWidget){
			return this._selectedSubWidget;
			
		}
	},
	
	_loadCssSelectors : function(widget, subWidget, state){
		//debugger;;
		var context = this.getContext();
		if (!widget){
			widget = this._selectedWidget;
			if (!subWidget){
				subWidget = this.getSelectedSubWidget();
			}
		}
		if(!widget) {
			return null;
		}
		
		var type = this.metaDataLoader.getType(widget);
		
		if(!type)
			return null;
		if(widget.id === 'all'){ // this is the mythical widget used for global change of widgets 
			type = type + '.$all'; // add this to the end so it will match the key in the metadata
		}
		
		
		if (!state){
			state = this._currentState; // the state is for all the widgets on the page
		}
	
		if(!state)
			state = "Normal";
		var allClasses = [];
		if(this.__DEBUG_TO_CONSOLE) console.log("[theme editor] query metadata, widget: " + widget.declaredClass + " subwidget:" + subWidget  + " state:" + state);
		var metadata = this._theme.getStyleSelectors(type,state,subWidget);
		
		for(var aa in metadata){
			
			allClasses.push(aa);
		}

		return allClasses; // wdr array of selectors

	},

	
    _propertiesChange : function (value){
		
		if(!this.isActiveEditor()) { return; }
		
		var values = value.values;
		if (this._selectedWidget){
			this.getContext().getCommandStack().execute(new davinci.ve.themeEditor.commands.StyleChangeCommand({_themeEditor: this,
			/*_rules: rules,*/ _values: values, _firstRun: true
			}));
		}
	},
	

	
	_rebaseCssRuleImagesForStylePalette: function(rules, values){ // the style palete assumes the basedir for images user/. where css in relation to the file.
		//debugger;;
		if (!rules) { return values; }
		for (var r=0; r < rules.length; r++){
			var rule = rules[r];
			for(var a in values){
				var propValue = rule.getProperty(a);
				if (propValue){ // only rebase urls for this rule.
					var url=propValue.getURL();
					if (url)
						values[a] = url;
				}
			}
		}
		return values;
		
	},

//	_modifyTheme : function (rules, values){
//		debugger;
//
//
//		var oldValues = new Array();
//		var unset = dojo.clone(values);
//		for (var r = 0; r < rules.length; r++){
//			var rule = rules[r];
//			var file = rule.searchUp( "CSSFile");
//			var rebasedValues = dojo.clone(values);
//			var rebasedValues = this._rebaseCssRuleImagesFromStylePalette(rule, rebasedValues);
//			for(var a in rebasedValues){
//				var x = rule.getProperty(a);
//				if (x){
//					oldValues[a] = x.value; // just want the value not the whole CSSProperty
//				}else if (!oldValues[a]){ // set by another rule
//					oldValues[a] = x; //undefined
//				}
//				if(!rebasedValues[a]){
//					rule.removeProperty(a);
//				}else if(this._theme.isPropertyVaildForWidgetRule(rule,a,this._selectedWidget) && x){ 
//					rule.setProperty(a,  rebasedValues[a]);
//					unset[a] = null;
//				}
//			}
//			this._markDirty(file.url);
//		}
//		// now set the new properties.
//		for (var r = 0; r < rules.length; r++){
//			var rule = rules[r];
//			var file = rule.searchUp( "CSSFile");
//			var rebasedValues = dojo.clone(unset);
//			var rebasedValues = this._rebaseCssRuleImagesFromStylePalette(rule, rebasedValues);
//			for(var a in rebasedValues){
//				if(this._theme.isPropertyVaildForWidgetRule(rule,a,this._selectedWidget) && (rebasedValues[a])){
//					//debugger;
//					rule.setProperty(a,  rebasedValues[a]);
//					//rebasedValues[a] = null;  not sure about this might be valid for more than one rule
//	
//				}
//			}
//			this._markDirty(file.url);
//		}
//		
//		return oldValues;
//		
//	},
	
	_markDirty : function (file){

		this._dirtyResource[file] = new Date().getTime();;
		this._srcChanged();
		
	},
	

	

	_srcChanged : function(){
		//this.isDirty=true;
		
		/* here's a huge hack to mark the .theme file as dirty when the source changes */
		if (!this.isDirty){ // only need to mark dirty once
			if (this._themeFileContent){ //only set if we have some content
				this.resourceFile.setContents(this._themeFileContent, true);
			}else {
				console.error('ThemeEditor.theme file content empty');
				this._themeFileContent = this.resourceFile.getText();
			}
		}
		this.isDirty=true;
		
		this.lastModifiedTime=new Date().getTime();
		if (this.editorContainer)
			this.editorContainer.setDirty(true);
	},
	
	getContext : function (){
    	return this.visualEditor.context;
    },
	
	getOutline : function (){
		return this.visualEditor.getOutline();
	},
	
	getPropertiesView : function (){
		return this.visualEditor.getPropertiesView();
	},
	getThemeFile : function(){
		return this.theme;
	},
	

	
	setContent : function (filename, content) {

		try{
			this._themePath=new davinci.model.Path(filename);
//			this._URLResolver = new davinci.ve.utils.URLResolver(filename);
			
			this.theme = dojo.isString(content)? dojo.fromJson(content) : content;
			this.theme.file = system.resource.findResource(filename);
			//dojo.connect(this.visualEditor, "onSelectionChange", this,"onSelectionChange");
			this.themeCssfiles = [];
			for(var i = 0;i<this.theme.files.length;i++){
				if(this.theme.files[i].indexOf(".css")>-1){
					this.themeCssfiles.push(this.theme.files[i]);
				}
			}
			
			/*
			 * resolve theme html in the user workspace.
			 */
			var themeHtmlResources = [];
			
			for(var y = 0;y<this.theme.themeEditorHtmls.length;y++){
				var resource=  this._getThemeResource(this.theme.themeEditorHtmls[y]);
				themeHtmlResources.push(resource);
				
			}

			this.visualEditor = new davinci.ve.themeEditor.VisualThemeEditor(this, this._cp.domNode,filename, this.themeCssfiles, themeHtmlResources,this.theme);
			
			this.fileName = filename;
			
			/*
			 * resolve metadata in the user workspace.
			 */
			var metaResources = [];
			
			for(var i = 0;i<this.theme.meta.length;i++){
				var resource = this._getThemeResource(this.theme.meta[i]);
				metaResources.push(resource);
				
			}
			
			this.metaDataLoader = new davinci.ve.themeEditor.metadata.query(metaResources);
			this._theme = new davinci.ve.themeEditor.metadata.CSSThemeProvider(metaResources, this.theme);
			// connect to the css files, so we can update the canvas when the model changes
			var cssFiles = this._getCssFiles();	
			var context = this.getContext();
			for (var i = 0; i < cssFiles.length; i++) {
                dojo.connect(cssFiles[i], 'onChange', context,
                        '_themeChange');
            }
			this._themeFileContent = this.resourceFile.getText(); // get the content for use later when setting dirty. Timing issue

			var subs = this._subscriptions;
			subs.push(dojo.subscribe("/davinci/ui/styleValuesChange", this,
			        '_propertiesChange'));
			subs.push(dojo.subscribe("/davinci/states/state/changed", this,
			        '_widgetStateChanged'));
			subs.push(dojo.subscribe("/davinci/ui/subwidgetSelectionChanged",
			        this, '_subwidgetSelectionChanged'));
			dojo.connect(this.visualEditor, "onSelectionChange", this,
			        "onSelectionChange");
		}catch(e){
			alert("error loading:" + filename + e);
			//delete this.tabs;
		}
	},

	getDefaultContent : function (){
		/* a template file should be specified in the extension definition instead
		 * 
		 */
		//return this.visualEditor.getDefaultContent();
	},

	selectModel : function (selection){

	},
	getFileEditors : function(){
		function getVisitor(dirtyResources, urlResolver, results) {
			return {
				lookFor : dirtyResources,
				urlResolver : urlResolver,
				result : results,
				_getObject :function(resource, text, lastModified){	
					return {resourceFile: resource, getText : function(){ return text; }, lastModifiedTime:lastModified };
				},
				visit : function(node){
					if(node.elementType=="CSSFile"){
						for(var aa in this.lookFor){
							if(aa==node.url){
								var resource=  system.resource.findResource(aa);
							
								this.result.push(this._getObject(resource, node.getText({noComments:false}), this.lookFor[aa]  ));
								//delete this.lookFor[aa]; we dont want to delete on autosave
								break;
							}
						}
					}
				return (this.lookFor.length<=0);
				}
			
			};
			
		
			
		};
		var results = [];
		var cssFiles = this._getCssFiles();
		var visitor = getVisitor(this._dirtyResource, this._URLResolver, results);
		if (cssFiles){
			for(var i=0;i<cssFiles.length;i++){
				cssFiles[i].visit(visitor);
			}
		}
		
		/* add the .theme file to the workingCopy resources so that its removed */
		
		results.push({resourceFile: this.resourceFile, getText : function(){ return this.resourceFile.getText(); }, lastModifiedTime:(new Date().getTime()) });
		return results;
		
	},
	save : function (isWorkingCopy){
		function getVisitor(dirtyResources, urlResolver, isWorkingCopy) {
			return {
				lookFor : dirtyResources,
				urlResolver : urlResolver,
				isWorkingCopy: isWorkingCopy,
				visit : function(node){
					if(node.elementType=="CSSFile"){
						for(var aa in this.lookFor){
							if(aa==node.url){
								var resource=  system.resource.findResource(aa);
								resource.setContents(node.getText({noComments:false}),this.isWorkingCopy);
								if (!this.isWorkingCopy) // only delete the dirty resource if we are save real copy not working
									delete this.lookFor[aa];
							}
						}
					}
				return (this.lookFor.length<=0);
				}
			};
		}

		var cssFiles = this._getCssFiles();
		var visitor = getVisitor(this._dirtyResource, this._URLResolver, isWorkingCopy);
		if (cssFiles){
			for(var i=0;i<cssFiles.length;i++){
				cssFiles[i].visit(visitor);
			}
		}
		if(!isWorkingCopy) {
			this.isDirty=false;
		}
		if (this.editorContainer && !isWorkingCopy) {
			this.editorContainer.setDirty(false);
		}
		//this.visualEditor.saved();
	},

	destroy : function ()	{
		this.inherited(arguments);
		if(this.visualEditor) { this.visualEditor.destroy(); }
		this._subscriptions.forEach(function(item) {
			/*var topic = item[0];  FIXME do we still need this? wdr
			var isStatesSubscription = topic.indexOf("/davinci/states") == 0;
			if (isStatesSubscription) {
				davinci.states.unsubscribe(item);
			} else {*/
				dojo.unsubscribe(item);
			//}
		});
		delete this._tempRules;
	},
	
	getText : function () {
		return dojo.toJson(this.theme, true);		
	},
	
	disableWidget: function(widget) {
		if (!widget) { return; }

		var frame = this.getContext().getDocument().getElementById("enableWidgetFocusFrame_" + widget.id); 
		if (frame){
			frame.parentNode.removeChild(frame);
		}
		//create
		this._createFrame(widget, 'disableWidgetFocusFrame_', 'disableWidgetFocusFrame');
	},
	
	_createFrame: function(widget, id, className){
		if (!widget) { return; }
		var frame = this.getContext().getDocument().getElementById(id + widget.id); 
		if (frame){
			return; // frame already exists 
		}
		var domNode = widget;
		if (widget.domNode)
			domNode = widget.domNode;
		
		var realleft =0;
		var realtop = 0;
		var obj = domNode;
		if (obj.offsetParent) {
			do {
				realleft += obj.offsetLeft;
				realtop += obj.offsetTop;
			} while (obj = obj.offsetParent);
		}
		var frame = this.getContext().getDocument().createElement("div");
		//dojo.connect(frame, "onclick", this, "editFrame");
		
		dojo.connect(frame, "onmousedown", this, "editFrameOnMouseDown");
		var containerNode = this.getContext().getContainerNode(); // click in white space
		dojo.connect(containerNode, "onmousedown", this, "canvasOnMouseDown");// click in white space
		frame.className = className;
		frame.id = id + widget.id;
		frame.style.position = "absolute";
		frame.style.width = domNode.offsetWidth + "px";
		frame.style.height = domNode.offsetHeight + "px";
		var padding = 2; // put some space between the subwidget and box
		realtop = realtop - padding;
		realleft = realleft - padding;
		frame.style.top = realtop + "px";
		frame.style.left = realleft + "px";
		frame.style.padding = padding + 'px';
		frame.style.display = "block";
		frame._widget = widget;
		domNode.parentNode.appendChild(frame);
	},
	
	canvasOnMouseDown: function(event){
		//console.log('ThemeEditor:canvasOnMouseDown');
		 // we should only get here when the canvas is clicked on, deslecting widget	
		if (this._selectedWidget){
			event.stopPropagation();
			var a = [null];
			if (this._currentSelectionRules) {
				delete this._currentSelectionRules;
			}
			this.getContext().getCommandStack().execute(new davinci.ve.themeEditor.commands.ThemeEditorCommand({_themeEditor: this,
				_widget: a, _firstRun: true

			}));
			this.getContext().select(null, false);


		}
	},
	
	editFrameOnMouseDown: function(event){
		event.stopPropagation(); 
		if(this.getContext()._activeTool && this.getContext()._activeTool.onMouseDown){
			this.getContext()._activeTool.onMouseDown(event);
		}
	},
	
	enableWidget: function(widget){

		if (!widget) { return; }
		var domNode = widget;
		if (widget.domNode) {
			domNode = widget.domNode;
		}
		var frame = this.getContext().getDocument().getElementById("disableWidgetFocusFrame_" + widget.id); 
		if (frame){
			frame.parentNode.removeChild(frame);
		}
		this._createFrame(widget, 'enableWidgetFocusFrame_', 'enableWidgetFocusFrame');
	}

});