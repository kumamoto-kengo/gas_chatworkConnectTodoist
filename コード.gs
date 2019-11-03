/**
 *
 * トリガーで定期実行
 * コピー処理
 * 1.chatworkのOPENタスクの一覧を読み込む
 * 2.todoistのOPENタスクの一覧を読み込む
 * 3.スプレッドシートののtodoistのOPENタスクの一覧を読み込む
 * 4.タスクIDを比較して重複しているタスクIDを削除
 * 5.重複がないタスクIDをキーにしてタスクをtodoistにコピー
 * 6.chatworkのマイタスクグループに通知
 * ※タスクIDに空文字を追加して文字列に変換
 * ※3はIFTTTのタイムラグ対策
 *
 * スプレッドシートの値が変更されたら
 * 完了処理
 * 7.スプシからtodoistのDONEタスクの一覧を読み込む
 * 8.chatworkのタスクのステータスをdoneに変更
 */

//setting
var mode = "";//null or debug
//chatwork
var chatworkToken = PropertiesService.getScriptProperties().getProperty("CHATWORK_TOKEN");
var chatworkEndpoint = PropertiesService.getScriptProperties().getProperty("CHATWORK_ENDPOINT");
var chatworkMytaskId = Number(PropertiesService.getScriptProperties().getProperty("CHATWORK_MYTASK_ID"));
//todoist
var todoistToken = PropertiesService.getScriptProperties().getProperty("TODOIST_TOKEN");
var todoistEndpoint = PropertiesService.getScriptProperties().getProperty("TODOIST_ENDPOINT");
var todoistProjectId = Number(PropertiesService.getScriptProperties().getProperty("TODOIST_PROJECT_ID"));
//spreadsheet
var sheetName = PropertiesService.getScriptProperties().getProperty("SHEET_NAME");
var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
var sheet = spreadsheet.getSheetByName(sheetName);

//コピー処理
function diffOpenTasks(){
  //1.chatworkのOPENタスクの一覧を読み込む
  var json_chatworkOpenTasks = getChatworkOpenTasks();
  //jsonを配列に変換
  var arr_chatworkOpenTasksId = [];//タスクIDだけの配列
  var arr_chatworkOpenTasks = [];//todoist登録に必要な項目の配列
  for each (var res in json_chatworkOpenTasks){
    
    //UNIX時間を変換
    var chatworkLimitTime = "";
    if(res.limit_type == "date"){
      var chatworkLimitTime = Utilities.formatDate(new Date(res.limit_time*1000), "JST", "yyyy/MM/dd");
    }else if(res.limit_type == "time"){
      var chatworkLimitTime = Utilities.formatDate(new Date(res.limit_time*1000), "JST", "yyyy/MM/dd HH:mm");
    }
    
    arr_chatworkOpenTasksId.push([
      res.task_id + '']);
    arr_chatworkOpenTasks.push([
      res.task_id + '',
      res.room.room_id,
      res.body,
      chatworkLimitTime]);
  }
  if(mode == "debug"){
    var msg = "【chatworkタスクID一覧】:arr_chatworkOpenTasksId】\n" + arr_chatworkOpenTasksId;
    postChatworkMytask(msg);
  }
  
  //2.todoistのOPENタスクの一覧を読み込む
  var json_todoistOpenTasks = getTodoistOpenTasks();
  //jsonを配列に変換
  var arr_todoistOpenTasksId = [];//chatworkTaskIdがあるタスクだけの配列
  for each (var res in json_todoistOpenTasks){
    var chatworkTaskId = "";
    if(res.content.indexOf("[ChatworkTaskId]") != -1){//chatworkから追加したタスクかどうか
      var chatworkTaskId = res.content.slice(-9);
    }
    arr_todoistOpenTasksId.push([
      chatworkTaskId + '']);
  }
  
  //3.スプレッドシートのtodoistのOPENタスクの一覧を読み込む
  var arr_sheetTasks = getSsTodoistTasks();
  //配列に追加
  for(var i=0 ;i <= arr_sheetTasks.length-1 ; i++){
    var chatworkTaskId = "";
    if(arr_sheetTasks[i][1] == "open"){
      if(arr_sheetTasks[i][0].indexOf("[ChatworkTaskId]") != -1){//chatworkから追加したタスクかどうか
        var chatworkTaskId = arr_sheetTasks[i][0].slice(-9);
        if(chatworkTaskId != ""){
          arr_todoistOpenTasksId.push([
            chatworkTaskId + '']);
        }
      }
    }
  }
  if(mode == "debug"){
    var msg = "【todoistタスクID一覧:arr_todoistOpenTasksId】\n" + arr_todoistOpenTasksId;
    postChatworkMytask(msg);
  }
  
  //4.タスクIDを比較して
  var arr_diffOpenTasksId = [];//配列比較用の配列
  //重複しているタスクIDを削除
  var arr_diffOpenTasksId = arr_chatworkOpenTasksId.filter(function(e){return arr_todoistOpenTasksId.filter(function(f){return e.toString() == f.toString()}).length == 0});
  
  if(arr_diffOpenTasksId == ""){
    if(mode == "debug"){
      var msg = "【タスクID差分:arr_diffOpenTasksId】\nchatworkタスクは全てtodoistに移行済です";
      postChatworkMytask(msg);
    }
    return false;//arr_diffOpenTasksIdが空だったら終了
  }else{
    if(mode == "debug"){
      var msg = "【タスクID差分:arr_diffOpenTasksId】\n" + arr_diffOpenTasksId;
      postChatworkMytask(msg);
    }
  }
  
  //5.重複がないタスクIDをキーにしてタスクをtodoistにコピー
  var data ="";//todoist登録用のjson
  for each (var res_diff in arr_diffOpenTasksId){
    for each (var res_chatwork in arr_chatworkOpenTasks){
      if(res_diff[0] == res_chatwork[0]){
        var data = {
          "content": res_chatwork[2] + "\n--\nfrom chatwork\nhttps://www.chatwork.com/#!rid" + res_chatwork[1] +"\n[ChatworkTaskId]" + res_chatwork[0],
          "due_string": res_chatwork[3],
          "due_lang": "ja",
          "priority": 4,
          "project_id": todoistProjectId
          };
        postTodoistOpenTasks(data);
  
        //6.chatworkのマイタスクグループに通知
        var msg = "[info][title]Todoistにタスクをコピーしました[/title]" + res_chatwork[2] + "[/info]";
        postChatworkMytask(msg);
  
        Utilities.sleep(2000);
      }
    }
  }
  if(mode == "debug"){
    var msg = "【todoist登録用データ:data】\n" + data;
    postChatworkMytask(msg);
  }
}

//完了処理
function doneChatworkTask() { 

  //7.スプシからtodoistのDONEタスクの一覧を読み込む
  var arr_sheetTasks = getSsTodoistTasks();
  
  for(var i=0 ;i <= arr_sheetTasks.length-1 ; i++){
    var chatworkTaskId = "";
    var chatworkRoomsId = "";
    if(arr_sheetTasks[i][1] == "done" && arr_sheetTasks[i][2] == "反映前"){
      if(arr_sheetTasks[i][0].indexOf("[ChatworkTaskId]") != -1){//chatworkから追加したタスクかどうか
        var chatworkTaskId = arr_sheetTasks[i][0].slice(-9);
        var chatworkRoomsId = arr_sheetTasks[i][0].substr(-35,9).replace("d","");
        
        //8.chatworkのタスクを完了にする
        if(chatworkTaskId != "" && chatworkRoomsId != ""){
          var chatworkQuery = "rooms/" + chatworkRoomsId + "/tasks/" + chatworkTaskId + "/status";
          var url = setChatworkEndpoint(chatworkQuery);
          var params = {
            muteHttpExceptions : true,
            payload: {'body':"done"},
            headers: {"X-ChatWorkToken":chatworkToken},
            method:"put"
          };
      
          var response = getReponse(url, params);
          if(response == "") return false;//responseが空だったら終了
      
          sheet.getRange(i+1,3).setValue("反映済");
  
          Utilities.sleep(2000);
      
        }
      }
    }
  }
}

//chatworkからopenタスクIDを取得
function getChatworkOpenTasks(){
  
  var chatworkQuery = "my/tasks?status=open";//my/tasks?status=openで自分の未完了タスクを取得する
  var url = setChatworkEndpoint(chatworkQuery);
  var params = {
    muteHttpExceptions : true,
    headers : {"X-ChatWorkToken" : chatworkToken},
    method : "get"
  };
  
  var response = getReponse(url, params);
  if(response == "") return false;//responseが空だったら終了
 
  var json_chatworkOpenTasks = JSON.parse(response.getContentText());
  return json_chatworkOpenTasks;
  
}

//todoistからopenタスクを取得
function getTodoistOpenTasks() {
  
  var todoistQuery = "tasks";
  var url = setTodoistEndpoint(todoistQuery);
  var params = {
    muteHttpExceptions : true,
    headers : {"Authorization":"Bearer " + todoistToken},
    method : "get"
  };
 
  var response = getReponse(url, params);
  if(response == "") return false;//responseが空だったら終了
 
  var json_todoistOpenTasks = JSON.parse(response.getContentText());
  return json_todoistOpenTasks;
}

//todoistのタスクをスプレッドシートから取得
function getSsTodoistTasks(){

  var sheetBVals = sheet.getRange('B:B').getValues(); // B列の値を配列で取得
  var sheetLastRow = sheetBVals.filter(String).length;//空白を除き、配列の数を取得
  var sheetLastColumn = sheet.getLastColumn();
  var sheetRange = sheet.getRange(1,1,sheetLastRow,sheetLastColumn);
  var sheetTasks = sheetRange.getValues();
  
  var arr_sheetTasks = [];
  var arr_sheetTasks = sheetTasks;
  
  return arr_sheetTasks;
}

//todoistにタスクを登録
function postTodoistOpenTasks(data){
  
  var todoistQuery = "tasks";
  var url = setTodoistEndpoint(todoistQuery);
  var uuid = Utilities.getUuid();
  var params = {
    muteHttpExceptions : true,
    payload : JSON.stringify(data),
    headers : {"Content-Type":"application/json",
               "X-Request-Id":uuid,
               "Authorization":"Bearer " + todoistToken},
    method: "post"
  };
  
  var response = getReponse(url, params);
  if(response == "") return false;//responseが空だったら終了
  
}

//chatworkマイタスクにメッセージ送信
function postChatworkMytask(msg){
  var chatworkQuery = "rooms/" + chatworkMytaskId + "/messages";
  var url = setChatworkEndpoint(chatworkQuery);
  var params = {
    muteHttpExceptions : true,
    headers : {"X-ChatWorkToken" : chatworkToken},
    payload : "body=" + msg + "&self_unread=1",//1:未読にする 0:既読にする
    method : "post"
  };
  var response = getReponse(url, params);
  return true;
}

//chatworkのエンドポイントとクエリをつないでURLを返す
function setChatworkEndpoint(chatworkQuery){
  var url = chatworkEndpoint + chatworkQuery;
  return url;
}

//todoistのエンドポイントとクエリをつないでURLを返す
function setTodoistEndpoint(todoistQuery){
  var url = todoistEndpoint + todoistQuery;
  return url;
}

//APIを叩く
function getReponse(url, params){
  try {
    var response = UrlFetchApp.fetch(url, params);
  } catch (e) {
    Logger.log(e);
    return false
  }
  return response;
}
