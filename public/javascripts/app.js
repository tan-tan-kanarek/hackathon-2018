/*
var config = new KalturaConfiguration();
config.serviceUrl = "{{ serviceUrl }}";

var client = new KalturaClient(config);
client.setKs("{{ ks }}");
*/

function noStream()
{
    console.log('Access to camera was denied!');
}

function gotStream(stream)
{
    var myButton = document.getElementById('buttonStart');
    if (myButton) {
        myButton.disabled = true;
    }
    
    videoStream = stream;
    console.log('Got stream.');
    
    video.onerror = function () {
        console.log('video.onerror');
        if (video) stop();
    };
    stream.onended = noStream;
    if (window.URL) {
        video.src = window.URL.createObjectURL(stream);
    }
    else if (video.mozSrcObject !== undefined) {//FF18a
        video.mozSrcObject = stream;
        video.play();
    }
    else if (navigator.mozGetUserMedia) {//FF16a, 17a
        video.src = stream;
        video.play();
    }
    else if (window.URL) {
        video.src = window.URL.createObjectURL(stream);
    }
    else {
        video.src = stream;
    }
    
    capture();
}

function capture() {
    setTimeout(captureAndSearch, 1000);
}

function captureAndSearch() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    var img = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    $.ajax({
        url: "search",
        type: "POST",
        data: "{\"image\":\"" + img + "\"}",
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (itemId) {
            console.log('Image uploaded', itemId);
            if(itemId) {
                document.location = 'item?id=' + itemId;
            }
            else {
                capture();
            }
        },
        error: function () {
            console.log("Upload failed");
            capture();
        }
    });
}

function loadSearch() {
    $('#searchButton').hide();
    $('#video').show();

    if ((typeof window === 'undefined') || (typeof navigator === 'undefined')) {
        console.log('This page needs a Web browser with the objects window.* and navigator.*!');
    }
    else if (!video) {
        console.log('HTML context error!');
    }
    else {
        console.log('Get user media');
        if (navigator.getUserMedia) navigator.getUserMedia({video:true}, gotStream, noStream);
        else if (navigator.oGetUserMedia) navigator.oGetUserMedia({video:true}, gotStream, noStream);
        else if (navigator.mozGetUserMedia) navigator.mozGetUserMedia({video:true}, gotStream, noStream);
        else if (navigator.webkitGetUserMedia) navigator.webkitGetUserMedia({video:true}, gotStream, noStream);
        else if (navigator.msGetUserMedia) navigator.msGetUserMedia({video:true, audio:false}, gotStream, noStream);
        else console.log('getUserMedia() not available from your Web browser!');
    }
}

$(function() {
    $('#searchButton').click(() => loadSearch());
});